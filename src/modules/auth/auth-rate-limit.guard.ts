import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { SlidingWindowRateLimitStore } from "../../common/rate-limiting/rate-limit-store";
import { resolveClientIp } from "../../common/rate-limiting/client-ip.util";
import { applyRateLimitHeaders, createRateLimitException } from "../../common/rate-limiting/headers.util";

/**
 * Per-IP sliding-window limiter for the unauthenticated auth endpoints
 * (login, register, google, forgot/reset password). These are the prime targets
 * for brute force, credential stuffing, registration spam, and password-reset
 * email bombing, and none of them are behind a JWT guard.
 *
 * Employs a sliding window algorithm to strictly prevent boundary burst attacks.
 * A single shared counter across all auth routes is intentional: it caps total
 * auth attempts from one source rather than letting an attacker spend a fresh
 * budget on each route. Uses Express-resolved req.ip (see TRUST_PROXY in main.ts)
 * so a direct client cannot spoof its source address.
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly store = new SlidingWindowRateLimitStore();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor() {
    this.windowMs = positiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 60_000);
    this.maxRequests = positiveInt(process.env.AUTH_RATE_LIMIT_MAX, 20);
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
      throw createRateLimitException("Too many authentication attempts. Please wait a moment and try again", result);
    }

    return true;
  }
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
