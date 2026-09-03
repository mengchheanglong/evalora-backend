import {
  HttpStatus,
  Injectable,
  type NestMiddleware,
} from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";
import { resolveClientIp } from "./client-ip.util";
import { InMemoryRateLimitStore, type RateLimitStore } from "./rate-limit-store";
import type { RateLimitOptions } from "./rate-limit.types";

const DEFAULT_WINDOW_MS = 60_000; // 1 minute
const DEFAULT_MAX_REQUESTS = 100; // 100 requests / minute per IP
const DEFAULT_ERROR_MESSAGE =
  "Too many requests from this IP address. Please wait a moment and try again.";

@Injectable()
export class GlobalRateLimitMiddleware implements NestMiddleware {
  private readonly store: RateLimitStore;
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly message: string;

  constructor(options?: Partial<RateLimitOptions>, store?: RateLimitStore) {
    this.store = store ?? new InMemoryRateLimitStore();
    this.windowMs = options?.windowMs ?? readPositiveInt(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS);
    this.maxRequests = options?.maxRequests ?? readPositiveInt(process.env.GLOBAL_RATE_LIMIT_MAX, DEFAULT_MAX_REQUESTS);
    this.message = options?.message ?? DEFAULT_ERROR_MESSAGE;
  }

  use(req: Request, res: Response, next: NextFunction): void {
    // 1. Skip preflight CORS requests
    if (req.method === "OPTIONS") {
      return next();
    }

    // 2. Resolve client key (IP address)
    const clientIp = resolveClientIp(req);

    // 3. Consume token
    const result = this.store.consume(clientIp, this.maxRequests, this.windowMs);

    // 4. Attach standard rate limiting headers
    res.setHeader("X-RateLimit-Limit", result.limit);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000));

    // 5. Handle exceeded threshold
    if (!result.allowed) {
      res.setHeader("Retry-After", result.retryAfterSeconds);
      res.status(HttpStatus.TOO_MANY_REQUESTS).json({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: "Too Many Requests",
        message: this.message,
        retryAfter: result.retryAfterSeconds,
      });
      return;
    }

    next();
  }

  /**
   * Access the underlying store for testing / operational inspection.
   */
  getStore(): RateLimitStore {
    return this.store;
  }
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
