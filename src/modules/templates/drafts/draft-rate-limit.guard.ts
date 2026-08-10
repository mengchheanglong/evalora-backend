import { type CanActivate, type ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { AuthenticatedRequest } from "../../auth/auth.guard";

interface WindowState {
  count: number;
  resetAt: number;
}

/**
 * Per-user fixed-window limiter for draft generation.
 *
 * Generation is the most expensive endpoint in the API: it accepts a multi-megabyte
 * upload, parses it, and then spends a paid model call. Unlike the auth limiter
 * this keys on the authenticated user rather than the IP, because the route is
 * behind a JWT and a whole office behind one NAT address should not share a budget.
 *
 * In-memory and dependency-free, matching AuthRateLimitGuard; swap for a shared
 * store once the API runs on more than one instance.
 */
@Injectable()
export class DraftRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, WindowState>();
  private readonly windowMs = positiveInt(process.env.DRAFT_RATE_LIMIT_WINDOW_MS, 60 * 60_000);
  private readonly maxRequests = positiveInt(process.env.DRAFT_RATE_LIMIT_MAX, 10);
  private lastSweep = 0;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & { ip?: string }>();
    const now = Date.now();
    // Falls back to the source address only if the guard is ever mounted ahead of
    // JwtAuthGuard; an unauthenticated caller must never share the unknown bucket.
    const key = request.user?.id ?? request.ip ?? "unknown";
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
          message: "You have generated a lot of drafts recently. Please wait a few minutes and try again.",
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
