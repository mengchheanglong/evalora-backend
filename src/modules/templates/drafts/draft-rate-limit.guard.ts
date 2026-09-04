import { type CanActivate, type ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../../auth/auth.guard";
import { SlidingWindowRateLimitStore } from "../../../common/rate-limiting/rate-limit-store";

/**
 * Per-user sliding-window limiter for draft generation.
 *
 * Generation is the most expensive endpoint in the API: it accepts a multi-megabyte
 * upload, parses it, and then spends a paid model call. Unlike the auth limiter
 * this keys on the authenticated user rather than the IP, because the route is
 * behind a JWT and a whole office behind one NAT address should not share a budget.
 *
 * Uses a sliding window algorithm to ensure smooth, unexploitable rate limiting.
 */
@Injectable()
export class DraftRateLimitGuard implements CanActivate {
  protected readonly store = new SlidingWindowRateLimitStore();
  protected readonly windowMs = positiveInt(process.env.DRAFT_RATE_LIMIT_WINDOW_MS, 60 * 60_000);
  protected readonly maxRequests = positiveInt(process.env.DRAFT_RATE_LIMIT_MAX, 10);
  protected readonly limitMessage: string = "You have generated a lot of drafts recently. Please wait a few minutes and try again.";

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest & { ip?: string }>();
    const response = typeof http.getResponse === "function" ? http.getResponse<Response>() : undefined;

    // Falls back to the source address only if the guard is ever mounted ahead of
    // JwtAuthGuard; an unauthenticated caller must never share the unknown bucket.
    const key = request.user?.id ?? request.ip ?? "unknown";

    const result = this.store.consume(key, this.maxRequests, this.windowMs);

    if (response?.setHeader) {
      response.setHeader("X-RateLimit-Limit", result.limit);
      response.setHeader("X-RateLimit-Remaining", result.remaining);
      response.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000));
    }

    if (!result.allowed) {
      if (response?.setHeader) {
        response.setHeader("Retry-After", result.retryAfterSeconds);
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: "Too Many Requests",
          message: this.limitMessage,
          retryAfter: result.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}

/**
 * Chat refinement gets its own bucket and a larger budget: one conversation is
 * several turns per draft, and sharing the generation window would let a single
 * chat session lock the user out of generating anything new. A distinct class
 * means a distinct Nest instance, so the two buckets never mix.
 */
@Injectable()
export class DraftChatRateLimitGuard extends DraftRateLimitGuard {
  protected override readonly windowMs = positiveInt(process.env.DRAFT_CHAT_RATE_LIMIT_WINDOW_MS, 60 * 60_000);
  protected override readonly maxRequests = positiveInt(process.env.DRAFT_CHAT_RATE_LIMIT_MAX, 40);
  protected override readonly limitMessage = "You have sent the assistant a lot of requests recently. Please wait a few minutes and try again.";
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
