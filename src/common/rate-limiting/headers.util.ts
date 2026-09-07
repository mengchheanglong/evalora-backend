import { HttpException, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import type { RateLimitResult } from "./rate-limit.types";

/**
 * Standard HTTP rate limiting headers (X-RateLimit-* & Retry-After).
 */
export const RATE_LIMIT_HEADERS = {
  LIMIT: "X-RateLimit-Limit",
  REMAINING: "X-RateLimit-Remaining",
  RESET: "X-RateLimit-Reset",
  RETRY_AFTER: "Retry-After",
} as const;

/**
 * Response payload structure for standardized 429 Too Many Requests responses.
 */
export interface RateLimitExceededResponse {
  statusCode: 429;
  error: "Too Many Requests";
  message: string;
  retryAfter: number;
  resetAt: string;
  limit: number;
  remaining: 0;
}

/**
 * Applies standard rate-limit headers to an outgoing Express response.
 */
export function applyRateLimitHeaders(
  response: Response | undefined,
  result: RateLimitResult,
): void {
  if (!response?.setHeader) return;

  response.setHeader(RATE_LIMIT_HEADERS.LIMIT, result.limit);
  response.setHeader(RATE_LIMIT_HEADERS.REMAINING, result.remaining);
  response.setHeader(RATE_LIMIT_HEADERS.RESET, Math.ceil(result.resetAt / 1000));

  if (!result.allowed) {
    response.setHeader(RATE_LIMIT_HEADERS.RETRY_AFTER, result.retryAfterSeconds);
  }
}

/**
 * Builds an informative 429 Too Many Requests response payload with clear retry instructions.
 */
export function buildRateLimitPayload(
  baseMessage: string,
  result: RateLimitResult,
): RateLimitExceededResponse {
  const seconds = result.retryAfterSeconds;
  const unit = seconds === 1 ? "second" : "seconds";
  const trimmed = baseMessage.trim().replace(/\.+$/, "");
  const instructionalMessage = `${trimmed}. Please retry in ${seconds} ${unit}.`;

  return {
    statusCode: HttpStatus.TOO_MANY_REQUESTS,
    error: "Too Many Requests",
    message: instructionalMessage,
    retryAfter: seconds,
    resetAt: new Date(result.resetAt).toISOString(),
    limit: result.limit,
    remaining: 0,
  };
}

/**
 * Creates an informative HttpException for HTTP 429 Too Many Requests.
 */
export function createRateLimitException(
  baseMessage: string,
  result: RateLimitResult,
): HttpException {
  return new HttpException(
    buildRateLimitPayload(baseMessage, result),
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
