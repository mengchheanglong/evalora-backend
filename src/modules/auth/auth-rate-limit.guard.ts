import { type CanActivate, type ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { Request } from "express";

interface WindowState {
  count: number;
  resetAt: number;
}

/**
 * Per-IP fixed-window limiter for the unauthenticated auth endpoints
 * (login, register, google, forgot/reset password). These are the prime targets
 * for brute force, credential stuffing, registration spam, and password-reset
 * email bombing, and none of them are behind a JWT guard.
 *
 * A single shared counter across all auth routes is intentional: it caps total
 * auth attempts from one source rather than letting an attacker spend a fresh
 * budget on each route. Uses Express-resolved req.ip (see TRUST_PROXY in main.ts)
 * so a direct client cannot spoof its source address.
 *
 * Kept dependency-free and in-memory; swap for a shared store (Redis) once the
 * API runs on more than one instance.
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, WindowState>();
  private readonly windowMs = positiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 60_000);
  private readonly maxRequests = positiveInt(process.env.AUTH_RATE_LIMIT_MAX, 20);
  private lastSweep = 0;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    const key = request.ip || request.socket?.remoteAddress || "unknown";
    this.sweep(now);
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (bucket.count >= this.maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: "Too Many Requests",
          message: "Too many authentication attempts. Please wait a moment and try again.",
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    bucket.count += 1;
    return true;
  }

  private sweep(now: number) {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
  }
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
