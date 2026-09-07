import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { SlidingWindowRateLimitStore } from "../../common/rate-limiting/rate-limit-store";
import { resolveClientIp } from "../../common/rate-limiting/client-ip.util";
import { applyRateLimitHeaders, createRateLimitException } from "../../common/rate-limiting/headers.util";

/**
 * Sliding-window rate limiter for candidate access code endpoints.
 * Protects public candidate session entry and heartbeat polling against
 * access code brute-forcing and denial-of-service attempts.
 */
@Injectable()
export class CandidateAccessRateLimitGuard implements CanActivate {
  private readonly store = new SlidingWindowRateLimitStore();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor() {
    this.windowMs = positiveInt(process.env.ACCESS_CODE_RATE_LIMIT_WINDOW_MS, 60_000);
    this.maxRequests = positiveInt(process.env.ACCESS_CODE_RATE_LIMIT_MAX, 120);
  }

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    // Preflight CORS requests must never consume rate limit quota
    if (request.method === "OPTIONS") {
      return true;
    }

    const response = typeof http.getResponse === "function" ? http.getResponse<Response>() : undefined;
    const key = resolveClientIp(request);

    const result = this.store.consume(key, this.maxRequests, this.windowMs);

    applyRateLimitHeaders(response, result);

    if (!result.allowed) {
      throw createRateLimitException("Too many candidate access requests. Please wait and try again", result);
    }

    return true;
  }
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
