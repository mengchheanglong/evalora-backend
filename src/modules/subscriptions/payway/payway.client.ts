import { BILLING_CURRENCY, formatAmount, toMinorUnits } from "../plan-catalog";
import { PAYWAY_PATHS, loadPayWayConfig } from "./payway.config";
import {
  checkTransactionHash,
  formatRequestTime,
  purchaseHash,
  verifyCallbackSignature as verifySignature,
} from "./payway.signature";
import {
  PayWayConfigurationError,
  type PayWayCheckOutcome,
  type PayWayCheckoutInput,
  type PayWayCheckoutSession,
  type PayWayConfig,
  type PayWayGateway,
} from "./payway.types";

/**
 * Only the documented customer-initiated Purchase (hosted checkout) and Check
 * Transaction APIs are used. There is no recurring-credential API, no token
 * charging, and no scheduled payment here — a subscription is extended by a new
 * customer payment, never by a stored credential.
 *
 * The backend does not call the Purchase API itself: the documented hosted flow
 * is a browser form POST to the Purchase endpoint, so this client returns the
 * signed fields and the browser submits them. The API key never leaves the server.
 */
export class PayWayClient implements PayWayGateway {
  private cached?: { config: PayWayConfig } | { error: PayWayConfigurationError };

  constructor(
    private readonly loadConfig: () => PayWayConfig = () => loadPayWayConfig(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  isConfigured(): boolean {
    return "config" in this.resolveConfig();
  }

  createCheckoutSession(input: PayWayCheckoutInput): PayWayCheckoutSession {
    const { config } = this.requireConfig();
    const reqTime = formatRequestTime(input.requestedAt);
    const amount = formatAmount(input.amountMinor);
    const itemName = `${input.plan} plan — ${input.billingCycle === "ANNUAL" ? "annual" : "monthly"} (prepaid)`;

    // `items` is description/remark only; PayWay never calculates from it.
    const items = Buffer.from(
      JSON.stringify([{ name: itemName, quantity: 1, price: input.amountMinor / 100 }]),
      "utf8",
    ).toString("base64");

    const fields: Record<string, string | undefined> = {
      // Explicitly request checkout HTML even for merchants with QR API enabled.
      // These presentation fields are excluded from PayWay's purchase hash.
      view_type: "hosted_view",
      payment_gate: "0",
      req_time: reqTime,
      merchant_id: config.merchantId,
      tran_id: input.tranId,
      amount,
      items,
      firstname: sanitizeName(input.buyer?.firstName),
      lastname: sanitizeName(input.buyer?.lastName),
      email: input.buyer?.email?.trim() || undefined,
      phone: input.buyer?.phone?.trim() || undefined,
      currency: input.currency || BILLING_CURRENCY,
      // KHQR, ABA PAY and cards are all offered by the hosted page for whichever
      // methods the merchant profile enables. KHQR here is a customer-initiated
      // prepaid payment only; it is never treated as a stored credential.
      return_url: encodeReturnUrl(config.paymentCallbackUrl, config.returnUrlEncoding),
      continue_success_url: `${config.appUrl}/settings/billing?checkout=return&tran_id=${encodeURIComponent(input.tranId)}`,
      cancel_url: `${config.appUrl}/settings/billing?checkout=cancelled&tran_id=${encodeURIComponent(input.tranId)}`,
      return_params: input.tranId,
    };

    // The hash covers the same object that is sent, so the two cannot diverge.
    const hash = purchaseHash(fields, config.apiKey);
    const sent: Record<string, string> = { hash };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) sent[key] = value;
    }

    return { actionUrl: `${config.baseUrl}${PAYWAY_PATHS.purchase}`, method: "POST", fields: sent };
  }

  verifyCallbackSignature(payload: unknown, signature: string | undefined): boolean {
    const resolved = this.resolveConfig();
    // An unconfigured gateway cannot verify anything; the service answers 503 first.
    if ("error" in resolved) return false;
    return verifySignature(payload, signature, resolved.config.apiKey);
  }

  async checkTransaction(tranId: string): Promise<PayWayCheckOutcome> {
    const { config } = this.requireConfig();
    const reqTime = formatRequestTime(new Date());
    const body = JSON.stringify({
      req_time: reqTime,
      merchant_id: config.merchantId,
      tran_id: tranId,
      hash: checkTransactionHash({ reqTime, merchantId: config.merchantId, tranId }, config.apiKey),
    });

    try {
      const response = await this.fetchImpl(`${config.baseUrl}${PAYWAY_PATHS.checkTransaction}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });
      if (!response.ok) {
        return { kind: "unavailable", reason: `PayWay check-transaction responded ${response.status}.` };
      }
      return parseCheckTransactionResponse(await response.json());
    } catch (error) {
      // Timeout, DNS failure, reset connection: the payment status is unknown, not declined.
      return {
        kind: "unavailable",
        reason: `PayWay check-transaction could not be completed: ${error instanceof Error ? error.message : "unknown error"}`,
      };
    }
  }

  private resolveConfig(): { config: PayWayConfig } | { error: PayWayConfigurationError } {
    if (!this.cached) {
      try {
        this.cached = { config: this.loadConfig() };
      } catch (error) {
        this.cached = {
          error:
            error instanceof PayWayConfigurationError
              ? error
              : new PayWayConfigurationError("ABA PayWay configuration could not be loaded."),
        };
      }
    }
    return this.cached;
  }

  private requireConfig(): { config: PayWayConfig } {
    const resolved = this.resolveConfig();
    if ("error" in resolved) throw resolved.error;
    return resolved;
  }
}

/**
 * Tolerates both documented response shapes: the OpenAPI file nests
 * `status` inside `data`, while PayWay's examples show a top-level `status`.
 */
export function parseCheckTransactionResponse(payload: unknown): PayWayCheckOutcome {
  if (!payload || typeof payload !== "object") {
    return { kind: "unavailable", reason: "PayWay check-transaction returned an unreadable body." };
  }
  const body = payload as Record<string, unknown>;
  const data = isRecord(body.data) ? body.data : undefined;
  const status = isRecord(body.status) ? body.status : data && isRecord(data.status) ? data.status : undefined;
  const code = status?.code === undefined || status.code === null ? null : String(status.code);

  // `00` is documented as success for Check Transaction.
  if (code !== null && code !== "00") {
    return {
      kind: "unavailable",
      reason: `PayWay check-transaction error ${code}: ${String(status?.message ?? "unknown")}`,
      gatewayCode: code,
    };
  }

  const source = data ?? body;
  const amount = firstAmount(source);
  return {
    kind: "resolved",
    verification: {
      providerStatusCode: readNumber(source.payment_status_code),
      providerStatus: readString(source.payment_status),
      amountMinor: amount.minor,
      amountSource: amount.source,
      currency: readString(source.payment_currency) ?? readString(source.currency),
      reference: readString(source.apv),
      gatewayCode: code,
      gatewayMessage: readString(status?.message),
    },
  };
}

function firstAmount(source: Record<string, unknown>): { minor: number | null; source: string | null } {
  // `total_amount` is the amount the customer was asked to pay after any discount;
  // the other two are documented fallbacks when it is absent.
  for (const key of ["total_amount", "original_amount", "payment_amount"] as const) {
    const raw = asNumber(source[key]);
    const minor = raw === null ? null : toMinorUnits(raw);
    if (minor !== null) return { minor, source: key };
  }
  return { minor: null, source: null };
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readNumber(value: unknown): number | null {
  return asNumber(value);
}

function readString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function encodeReturnUrl(url: string, encoding: PayWayConfig["returnUrlEncoding"]): string {
  // The hash is computed over this exact value, so both branches stay consistent.
  return encoding === "base64" ? Buffer.from(url, "utf8").toString("base64") : url;
}

/** PayWay rejects names containing digits or special characters (error 16/17). */
function sanitizeName(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/[^\p{L}\p{M}\s'.-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 100);
  return cleaned ? cleaned : undefined;
}
