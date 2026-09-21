import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA512 signing, implemented exactly as ABA PayWay documents it.
 *
 * Purchase API `hash`: base64(HMAC-SHA512(concatenation of the values below, in
 * this order, api_key)). Absent fields contribute an empty string, which is what
 * the documented PHP reference does when a variable is unset.
 *
 * Check Transaction `hash`: the documented sample hashes
 * `req_time + merchant_id + tran_id` (the prose only mentions merchant_id and
 * tran_id; the sample code is the version PayWay itself ships).
 *
 * Payment callback: the `X-PAYWAY-HMAC-SHA512` header is
 * base64(HMAC-SHA512(concatenation of all callback values with the keys sorted
 * ascending, api_key)). Keys are not part of the payload, and array/object
 * values are JSON-encoded first — see `phpJsonEncode` for why the PHP encoder's
 * escaping is reproduced.
 */

export const PAYWAY_SIGNATURE_HEADER = "x-payway-hmac-sha512";

/** Documented field order for the Purchase API hash. */
export const PURCHASE_HASH_FIELD_ORDER = [
  "req_time",
  "merchant_id",
  "tran_id",
  "amount",
  "items",
  "shipping",
  "firstname",
  "lastname",
  "email",
  "phone",
  "type",
  "payment_option",
  "return_url",
  "cancel_url",
  "continue_success_url",
  "return_deeplink",
  "currency",
  "custom_fields",
  "return_params",
  "payout",
  "lifetime",
  "additional_params",
  "google_pay_token",
  "skip_success_page",
] as const;

export function hmacSha512Base64(payload: string, apiKey: string): string {
  return createHmac("sha512", apiKey).update(payload, "utf8").digest("base64");
}

export function purchaseHash(
  fields: Readonly<Record<string, string | number | undefined>>,
  apiKey: string,
): string {
  const payload = PURCHASE_HASH_FIELD_ORDER.map((field) => phpConcatValue(fields[field])).join("");
  return hmacSha512Base64(payload, apiKey);
}

export function checkTransactionHash(
  input: { reqTime: string; merchantId: string; tranId: string },
  apiKey: string,
): string {
  return hmacSha512Base64(`${input.reqTime}${input.merchantId}${input.tranId}`, apiKey);
}

/** Signature PayWay must send in `X-PAYWAY-HMAC-SHA512` for this callback body. */
export function callbackSignature(payload: unknown, apiKey: string): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const entries = Object.entries(payload as Record<string, unknown>).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return hmacSha512Base64(entries.map(([, value]) => phpConcatValue(value)).join(""), apiKey);
}

/** Constant-time comparison; an absent or malformed header is never a match. */
export function verifyCallbackSignature(payload: unknown, received: string | undefined, apiKey: string): boolean {
  const expected = callbackSignature(payload, apiKey);
  if (!expected || typeof received !== "string") return false;
  const provided = received.trim();
  if (!provided) return false;

  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  if (expectedBytes.length !== providedBytes.length) return false;
  return timingSafeEqual(expectedBytes, providedBytes);
}

export function formatRequestTime(date: Date): string {
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

/**
 * PHP's string coercion, used because the documented request hash is built by
 * concatenating values into a PHP string. Missing values are empty, `true` is
 * "1", and arrays/objects are JSON-encoded.
 */
function phpConcatValue(value: unknown): string {
  if (value === null || value === undefined || value === false) return "";
  if (value === true) return "1";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "object") return phpJsonEncode(value);
  return String(value);
}

/**
 * `json_encode()` with its default flags, which is what the documented PHP
 * verification sample uses: forward slashes are escaped and non-ASCII
 * characters become \uXXXX. Only nested callback values reach this path — every
 * field in the documented pushback payload is a flat string.
 */
function phpJsonEncode(value: unknown): string {
  return JSON.stringify(value)
    .replace(/\//g, "\\/")
    .replace(/[\u007f-\uffff]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
