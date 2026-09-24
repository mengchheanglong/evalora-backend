import type { Request } from "express";
import { resolveClientIp } from "./client-ip.util";

/**
 * Addresses that always bypass rate limiting. The express-resolved client IP is
 * normalized before this check (see client-ip.util), so loopback arrives as
 * "127.0.0.1"; the IPv6 and IPv4-mapped spellings are kept for defense in depth.
 */
const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]);

/**
 * Single source of truth for the development rate-limit bypass.
 *
 * - Non-production environments (NODE_ENV !== "production"): rate limiting is
 *   disabled entirely. The live interview frontend polls
 *   GET /sessions/:id/transcript and /interviewer-follow-ups/session/:id every
 *   few seconds, which would otherwise trip the per-IP budget and make local
 *   development unusable with escalating 429 retry countdowns.
 * - Production: loopback traffic (health probes, local diagnostics) is still
 *   exempt. Remote clients keep their normal quota.
 */
export function shouldBypassRateLimit(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  return LOOPBACK_IPS.has(resolveClientIp(request).toLowerCase());
}

/**
 * Logs exactly ONE warning line per scope per process when a limit is hit.
 * 429 bursts (retry storms, polling loops) must not flood the terminal; the
 * X-RateLimit-* and Retry-After headers still describe every individual hit.
 */
const warnedScopes = new Set<string>();

export function warnRateLimitHit(scope: string, key: string, retryAfterSeconds: number): void {
  if (warnedScopes.has(scope)) return;
  warnedScopes.add(scope);
  console.warn(
    `[rate-limit] ${scope}: limit hit for "${key}" — responding 429 with Retry-After ${retryAfterSeconds}s (one warning per scope; further hits are not logged).`,
  );
}
