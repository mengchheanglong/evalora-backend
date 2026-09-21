import {
  PayWayConfigurationError,
  type PayWayConfig,
  type PayWayEnvironment,
  type PayWayReturnUrlEncoding,
} from "./payway.types";

/**
 * PayWay configuration is read from the environment on demand so a missing
 * sandbox key cannot stop the rest of the API from booting, and so tests can
 * supply their own values. Nothing here is ever exposed to the browser: the
 * `hash` is computed server-side and the browser only receives the signed form
 * fields.
 */

/** Documented endpoints. Both live under the checkout host of the environment. */
export const PAYWAY_PATHS = {
  purchase: "/api/payment-gateway/v1/payments/purchase",
  checkTransaction: "/api/payment-gateway/v1/payments/check-transaction-2",
} as const;

const DEFAULT_BASE_URLS: Record<PayWayEnvironment, string> = {
  sandbox: "https://checkout-sandbox.payway.com.kh",
  production: "https://checkout.payway.com.kh",
};

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export const PAYWAY_ENV_KEYS = [
  "PAYWAY_ENV",
  "PAYWAY_BASE_URL",
  "PAYWAY_MERCHANT_ID",
  "PAYWAY_API_KEY",
  "PAYWAY_PAYMENT_CALLBACK_URL",
  "PAYWAY_RETURN_URL_ENCODING",
  "PAYWAY_REQUEST_TIMEOUT_MS",
] as const;

export function loadPayWayConfig(env: NodeJS.ProcessEnv = process.env): PayWayConfig {
  const missing: string[] = [];
  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) missing.push(name);
    return value ?? "";
  };

  const environment = readEnvironment(env.PAYWAY_ENV?.trim());
  const merchantId = required("PAYWAY_MERCHANT_ID");
  const apiKey = required("PAYWAY_API_KEY");
  const paymentCallbackUrl = required("PAYWAY_PAYMENT_CALLBACK_URL");
  const baseUrl = (env.PAYWAY_BASE_URL?.trim() || DEFAULT_BASE_URLS[environment]).replace(/\/$/, "");

  if (missing.length) {
    throw new PayWayConfigurationError(
      `ABA PayWay is not configured. Set ${missing.sort().join(", ")} on the backend before accepting payments.`,
    );
  }
  if (environment === "production" && !baseUrl.startsWith("https://")) {
    throw new PayWayConfigurationError("PAYWAY_BASE_URL must use https:// in production.");
  }
  if (env.PAYWAY_BASE_URL?.trim() && environment === "production" && baseUrl.includes("sandbox")) {
    throw new PayWayConfigurationError("PAYWAY_BASE_URL points at the sandbox host while PAYWAY_ENV=production.");
  }
  if (env.PAYWAY_BASE_URL?.trim() && environment === "sandbox" && !baseUrl.includes("sandbox")) {
    throw new PayWayConfigurationError("PAYWAY_BASE_URL does not look like a sandbox host while PAYWAY_ENV=sandbox.");
  }

  return {
    environment,
    baseUrl,
    merchantId,
    apiKey,
    paymentCallbackUrl,
    returnUrlEncoding: readReturnUrlEncoding(env.PAYWAY_RETURN_URL_ENCODING?.trim()),
    requestTimeoutMs: readTimeout(env.PAYWAY_REQUEST_TIMEOUT_MS?.trim()),
    appUrl: resolveAppUrl(env),
  };
}

/** Same origin resolution the invitation email links use, so billing returns to the real app. */
export function resolveAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.APP_URL?.trim() || env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const frontend = (env.FRONTEND_URL ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)[0];
  return frontend ? frontend.replace(/\/$/, "") : "http://localhost:3010";
}

function readEnvironment(raw: string | undefined): PayWayEnvironment {
  if (!raw) return "sandbox";
  const value = raw.toLowerCase();
  if (value === "sandbox" || value === "production") return value;
  throw new PayWayConfigurationError('PAYWAY_ENV must be "sandbox" or "production".');
}

/**
 * ABA documents `return_url` as "encrypted with Base64" while `continue_success_url`
 * is a plain URL. Whether the hash covers the encoded or the decoded value is not
 * stated, so the encoding is configuration: if the sandbox answers Purchase error
 * code `1` (wrong hash), flip this value instead of editing code. The hash is
 * always computed over the exact string that is sent.
 */
function readReturnUrlEncoding(raw: string | undefined): PayWayReturnUrlEncoding {
  if (!raw) return "base64";
  const value = raw.toLowerCase();
  if (value === "base64" || value === "plain") return value;
  throw new PayWayConfigurationError('PAYWAY_RETURN_URL_ENCODING must be "base64" or "plain".');
}

function readTimeout(raw: string | undefined): number {
  if (!raw) return DEFAULT_REQUEST_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 60_000) {
    throw new PayWayConfigurationError("PAYWAY_REQUEST_TIMEOUT_MS must be between 1 and 60000.");
  }
  return Math.trunc(value);
}
