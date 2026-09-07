import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { resolveClientIp } from "./client-ip.util";
import { SlidingWindowRateLimitStore, type RateLimitStore } from "./rate-limit-store";
import { applyRateLimitHeaders, createRateLimitException } from "./headers.util";

export interface RouteRateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

/**
 * Base sliding-window rate limit guard for critical and resource-heavy endpoints.
 * Provides uniform header attachment, error formatting, and per-route quota isolation.
 */
@Injectable()
export class BaseRouteRateLimitGuard implements CanActivate {
  protected readonly store: RateLimitStore;
  protected readonly windowMs: number;
  protected readonly maxRequests: number;
  protected readonly message: string;
  protected readonly keyGenerator?: (req: Request) => string;

  constructor(config: RouteRateLimitConfig, store?: RateLimitStore) {
    this.store = store ?? new SlidingWindowRateLimitStore();
    this.windowMs = config.windowMs;
    this.maxRequests = config.maxRequests;
    this.message = config.message ?? "Too many requests. Please slow down and try again shortly.";
    this.keyGenerator = config.keyGenerator;
  }

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = typeof http.getResponse === "function" ? http.getResponse<Response>() : undefined;

    const key = this.resolveKey(request);
    const result = this.store.consume(key, this.maxRequests, this.windowMs);

    // Apply standard headers (X-RateLimit-* & Retry-After)
    applyRateLimitHeaders(response, result);

    if (!result.allowed) {
      throw createRateLimitException(this.message, result);
    }

    return true;
  }

  protected resolveKey(request: Request): string {
    if (this.keyGenerator) {
      return this.keyGenerator(request);
    }
    return resolveClientIp(request);
  }

  getStore(): RateLimitStore {
    return this.store;
  }
}
