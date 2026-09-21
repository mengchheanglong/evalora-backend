/**
 * Types shared by the PayWay adapter. Nothing in this file touches the
 * database or the HTTP layer, so the contract surface ABA documents stays in
 * one small place that is easy to review against their reference.
 */

export type PayWayEnvironment = "sandbox" | "production";

/** How the callback URL is encoded in the Purchase request. See payway.config.ts. */
export type PayWayReturnUrlEncoding = "base64" | "plain";

export interface PayWayConfig {
  environment: PayWayEnvironment;
  baseUrl: string;
  merchantId: string;
  /** Server-only hash key. Never sent to the browser and never logged. */
  apiKey: string;
  /** Absolute URL PayWay pushes the payment result to. */
  paymentCallbackUrl: string;
  returnUrlEncoding: PayWayReturnUrlEncoding;
  requestTimeoutMs: number;
  /** Absolute frontend origin used for the customer's return redirects. */
  appUrl: string;
}

/**
 * Documented Payment status codes from Check Transaction
 * (`payment_status_code`). Any other value is treated as UNKNOWN and never
 * activates a subscription.
 */
export const PAYWAY_STATUS_CODES = {
  APPROVED: 0,
  PENDING: 2,
  DECLINED: 3,
  REFUNDED: 4,
  CANCELLED: 7,
} as const;

export type PaymentOutcome =
  | "APPROVED"
  | "PENDING"
  | "DECLINED"
  | "REFUNDED"
  | "CANCELLED"
  | "UNKNOWN";

/** Normalized, provider-agnostic view of a Check Transaction response. */
export interface PayWayTransactionVerification {
  providerStatusCode: number | null;
  providerStatus: string | null;
  /** `total_amount`, else `original_amount`, else `payment_amount`; null when absent. */
  amountMinor: number | null;
  amountSource: string | null;
  currency: string | null;
  /** PayWay approval code (`apv`). */
  reference: string | null;
  gatewayCode: string | null;
  gatewayMessage: string | null;
}

/**
 * Asking PayWay about a transaction can fail in ways that say nothing about the
 * payment itself (timeout, connection reset, gateway error). Those are
 * `unavailable`, never a decline: an uncertain transaction is left PENDING and
 * reconciled later instead of being retried or failed.
 */
export type PayWayCheckOutcome =
  | { kind: "resolved"; verification: PayWayTransactionVerification }
  | { kind: "unavailable"; reason: string; gatewayCode?: string | null };

export interface PayWayCheckoutInput {
  tranId: string;
  plan: string;
  billingCycle: string;
  amountMinor: number;
  /** ISO currency code sent to PayWay; the backend catalog owns the value. */
  currency: string;
  /** UTC time the signed request is built for (`req_time`). */
  requestedAt: Date;
  buyer?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
}

/** Everything the browser needs to submit the hosted checkout form. */
export interface PayWayCheckoutSession {
  actionUrl: string;
  method: "POST";
  fields: Record<string, string>;
}

export interface PayWayGateway {
  isConfigured(): boolean;
  /** Builds the signed hosted-checkout request. Throws PayWayConfigurationError when unconfigured. */
  createCheckoutSession(input: PayWayCheckoutInput): PayWayCheckoutSession;
  /** Authoritative payment status. Never trusts a redirect or callback body. */
  checkTransaction(tranId: string): Promise<PayWayCheckOutcome>;
  /**
   * Constant-time check of the `X-PAYWAY-HMAC-SHA512` header. Lives on the
   * gateway so the merchant hash key never has to leave the adapter.
   */
  verifyCallbackSignature(payload: unknown, signature: string | undefined): boolean;
}

export class PayWayConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayWayConfigurationError";
  }
}
