import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { SlidingWindowRateLimitStore } from "../../../common/rate-limiting/rate-limit-store";
import { resolveClientIp } from "../../../common/rate-limiting/client-ip.util";
import { applyRateLimitHeaders, createRateLimitException } from "../../../common/rate-limiting/headers.util";

/**
 * Sliding-window rate limiter for the code-execution endpoints.
 * These proxy untrusted code to the sandbox, are currently unauthenticated,
 * and must not be usable as a free compute amplifier.
 *
 * Uses a sliding window algorithm to strictly prevent boundary burst attacks
 * and resource exhaustion of the execution runner.
 */
@Injectable()
export class CodeRateLimitGuard implements CanActivate {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly store = new SlidingWindowRateLimitStore();

  constructor() {
    this.windowMs = this.readPositiveInt(process.env.CODE_RATE_LIMIT_WINDOW_MS, 60_000);
    this.maxRequests = this.readPositiveInt(process.env.CODE_RATE_LIMIT_MAX, 30);
  }

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    // Preflight CORS requests must never consume rate limit quota
    if (request.method === "OPTIONS") {
      return true;
    }

    const response = typeof http.getResponse === "function" ? http.getResponse<Response>() : undefined;
    const key = this.resolveClientKey(request);

    const result = this.store.consume(key, this.maxRequests, this.windowMs);

    applyRateLimitHeaders(response, result);

    if (!result.allowed) {
      throw createRateLimitException("Too many code execution requests. Please slow down and try again shortly", result);
    }

    return true;
  }

  private resolveClientKey(request: Request): string {
    // Use the address Express resolved with full normalization. It only derives from X-Forwarded-For when
    // the operator has opted into a trusted proxy chain via `trust proxy`
    // (see TRUST_PROXY in main.ts). Never parse the header directly, otherwise any
    // client could rotate X-Forwarded-For to mint a fresh bucket per request and
    // bypass the limit entirely.
    return resolveClientIp(request);
  }

  private readPositiveInt(raw: string | undefined, fallback: number): number {
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
