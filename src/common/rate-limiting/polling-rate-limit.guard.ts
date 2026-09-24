import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { BaseRouteRateLimitGuard } from "./route-rate-limit.guard";
import { resolveClientIp } from "./client-ip.util";

/**
 * Limiter for the live-interview polling endpoints (staff surface):
 *   GET /sessions/:id/transcript
 *   GET /interviewer-follow-ups/session/:id
 *   POST /interviewer-follow-ups/session/:id
 *
 * Production floor required by the frontend's polling cadence: >= 60 req/min
 * for the GETs and >= 20 req/min for the POST. One shared per-IP bucket of
 * 120/min covers the worst realistic mix (60 GETs + 20 POSTs) with headroom
 * while still bounding an abusive client. In development (NODE_ENV !==
 * "production") this guard bypasses entirely — see dev-bypass.util.
 */
@Injectable()
export class StaffPollingRateLimitGuard extends BaseRouteRateLimitGuard {
  constructor() {
    super({
      windowMs: positiveInt(process.env.POLLING_RATE_LIMIT_WINDOW_MS, 60_000),
      maxRequests: positiveInt(process.env.POLLING_RATE_LIMIT_MAX, 120),
      message: "Too many polling requests. Please slow down and try again shortly.",
    });
  }

  protected override resolveKey(request: Request): string {
    // The staff polling routes are JWT-authenticated; a user key keeps a whole
    // office behind one NAT from sharing a budget.
    const user = (request as Request & { user?: { id?: string } }).user;
    return user?.id ?? resolveClientIp(request);
  }
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
