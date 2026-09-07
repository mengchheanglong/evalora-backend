import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../auth/auth.guard";
import { SlidingWindowRateLimitStore } from "../../../common/rate-limiting/rate-limit-store";
import { resolveClientIp } from "../../../common/rate-limiting/client-ip.util";
import { applyRateLimitHeaders, createRateLimitException } from "../../../common/rate-limiting/headers.util";

/**
 * Sliding-window rate limiter for resource-heavy AI inference endpoints.
 * Protects against upstream LLM token exhaustion, runaway API costs,
 * and deliberate denial-of-service attempts on AI generation / evaluation services.
 */
@Injectable()
export class AiRateLimitGuard implements CanActivate {
  private readonly store = new SlidingWindowRateLimitStore();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor() {
    this.windowMs = positiveInt(process.env.AI_RATE_LIMIT_WINDOW_MS, 60_000);
    this.maxRequests = positiveInt(process.env.AI_RATE_LIMIT_MAX, 30);
  }

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest & Request>();

    // Preflight CORS requests must never consume rate limit quota
    if (request.method === "OPTIONS") {
      return true;
    }

    const response = typeof http.getResponse === "function" ? http.getResponse<Response>() : undefined;

    const key = request.user?.id ?? resolveClientIp(request);
    const result = this.store.consume(key, this.maxRequests, this.windowMs);

    applyRateLimitHeaders(response, result);

    if (!result.allowed) {
      throw createRateLimitException("Too many AI generation requests. Please slow down and try again shortly", result);
    }

    return true;
  }
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
