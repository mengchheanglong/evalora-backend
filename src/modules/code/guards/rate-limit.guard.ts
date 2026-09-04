import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { SlidingWindowRateLimitStore } from "../../../common/rate-limiting/rate-limit-store";

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
    const response = typeof http.getResponse === "function" ? http.getResponse<Response>() : undefined;
    const key = this.resolveClientKey(request);

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
          message: "Too many code execution requests. Please slow down and try again shortly.",
          retryAfter: result.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

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

  private readPositiveInt(raw: string | undefined, fallback: number): number {
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
