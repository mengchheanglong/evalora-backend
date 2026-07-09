import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

interface WindowState {
  count: number;
  resetAt: number;
}

/**
 * Lightweight in-memory fixed-window rate limiter for the code-execution
 * endpoints. These proxy untrusted code to the sandbox, are currently
 * unauthenticated, and must not be usable as a free compute amplifier.
 *
 * Kept dependency-free on purpose; swap for @nestjs/throttler + a shared store
 * (Redis) once the API runs multiple instances.
 */
@Injectable()
export class CodeRateLimitGuard implements CanActivate {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly buckets = new Map<string, WindowState>();
  private lastSweep = 0;

  constructor() {
    this.windowMs = this.readPositiveInt(process.env.CODE_RATE_LIMIT_WINDOW_MS, 60_000);
    this.maxRequests = this.readPositiveInt(process.env.CODE_RATE_LIMIT_MAX, 30);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    const key = this.resolveClientKey(request);

    this.sweepExpired(now);

    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (bucket.count >= this.maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: "Too Many Requests",
          message: "Too many code execution requests. Please slow down and try again shortly.",
          retryAfter: retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
    return true;
  }

  private resolveClientKey(request: Request): string {
    // Use the address Express resolved. It only derives from X-Forwarded-For when
    // the operator has opted into a trusted proxy chain via `trust proxy`
    // (see TRUST_PROXY in main.ts). Never parse the header directly, otherwise any
    // client could rotate X-Forwarded-For to mint a fresh bucket per request and
    // bypass the limit entirely.
    return request.ip || request.socket?.remoteAddress || "unknown";
  }

  private sweepExpired(now: number): void {
    // Bound memory: reclaim expired buckets at most once per window.
    if (now - this.lastSweep < this.windowMs) {
      return;
    }

    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }

  private readPositiveInt(raw: string | undefined, fallback: number): number {
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
