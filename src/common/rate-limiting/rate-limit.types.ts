import type { Request } from "express";

export interface RateLimitOptions {
  /** Time window in milliseconds (default: 60,000 = 1 minute) */
  windowMs: number;
  /** Maximum number of allowed requests in the window (default: 100) */
  maxRequests: number;
  /** Human-readable error message returned when limit is exceeded */
  message?: string;
  /** Optional custom key generator function (defaults to client IP) */
  keyGenerator?: (req: Request) => string;
  /** Optional function to determine if request should bypass rate limiting */
  skip?: (req: Request) => boolean;
}

export interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}
