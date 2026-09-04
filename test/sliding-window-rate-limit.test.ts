import "reflect-metadata";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { HttpException, HttpStatus } from "@nestjs/common";
import {
  SlidingWindowRateLimitStore,
  BaseRouteRateLimitGuard,
} from "../src/common/rate-limiting";
import { AiRateLimitGuard } from "../src/modules/ai/guards/ai-rate-limit.guard";
import { CandidateAccessRateLimitGuard } from "../src/modules/sessions/access-rate-limit.guard";
import {
  DraftRateLimitGuard,
  DraftChatRateLimitGuard,
} from "../src/modules/templates/drafts/draft-rate-limit.guard";

function createMockContext(ip = "127.0.0.1", user?: { id: string }, headers: Record<string, string> = {}) {
  const responseHeaders: Record<string, any> = {};
  const req: any = {
    ip,
    headers,
    user,
    socket: { remoteAddress: ip },
  };
  const res: any = {
    statusCode: 200,
    headers: responseHeaders,
    setHeader(name: string, value: any) {
      responseHeaders[name.toLowerCase()] = value;
      return this;
    },
  };

  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
    responseHeaders,
  };
}

test("SlidingWindowRateLimitStore smoothly slides without boundary burst leaks", () => {
  const store = new SlidingWindowRateLimitStore();
  const limit = 3;
  const windowMs = 1_000; // 1 second rolling window

  // t = 100: consume 1
  const r1 = store.consume("client-burst", limit, windowMs, 100);
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 2);

  // t = 200: consume 2
  const r2 = store.consume("client-burst", limit, windowMs, 200);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 1);

  // t = 300: consume 3 (limit reached)
  const r3 = store.consume("client-burst", limit, windowMs, 300);
  assert.equal(r3.allowed, true);
  assert.equal(r3.remaining, 0);

  // t = 500: 4th attempt in the same rolling window must be rejected
  const r4 = store.consume("client-burst", limit, windowMs, 500);
  assert.equal(r4.allowed, false);
  assert.equal(r4.remaining, 0);
  assert.equal(r4.retryAfterSeconds, 1); // 100 + 1000 - 500 = 600ms -> ceil(0.6) = 1s

  // t = 1101: the first request at t=100 has slid out of [101, 1101]!
  // Slot frees up for exactly 1 request
  const r5 = store.consume("client-burst", limit, windowMs, 1101);
  assert.equal(r5.allowed, true);
  assert.equal(r5.remaining, 0);

  // Immediate subsequent request at t=1102 is rejected again (200, 300, 1101 are in window)
  const r6 = store.consume("client-burst", limit, windowMs, 1102);
  assert.equal(r6.allowed, false);

  // t = 1205: second request at t=200 has slid out of [205, 1205]!
  const r7 = store.consume("client-burst", limit, windowMs, 1205);
  assert.equal(r7.allowed, true);
});

test("BaseRouteRateLimitGuard applies route-specific limits and sets standard headers", () => {
  const guard = new BaseRouteRateLimitGuard({
    windowMs: 60_000,
    maxRequests: 2,
    message: "Route limit reached.",
  });

  const ctx1 = createMockContext("192.168.10.1");
  assert.equal(guard.canActivate(ctx1 as any), true);
  assert.equal(ctx1.responseHeaders["x-ratelimit-limit"], 2);
  assert.equal(ctx1.responseHeaders["x-ratelimit-remaining"], 1);

  const ctx2 = createMockContext("192.168.10.1");
  assert.equal(guard.canActivate(ctx2 as any), true);
  assert.equal(ctx2.responseHeaders["x-ratelimit-remaining"], 0);

  const ctx3 = createMockContext("192.168.10.1");
  assert.throws(
    () => guard.canActivate(ctx3 as any),
    (err: any) => {
      assert.ok(err instanceof HttpException);
      assert.equal(err.getStatus(), HttpStatus.TOO_MANY_REQUESTS);
      const res = err.getResponse() as any;
      assert.equal(res?.message, "Route limit reached.");
      assert.ok(res?.retryAfter >= 1);
      return true;
    },
  );
  assert.ok(ctx3.responseHeaders["retry-after"] >= 1);
});

test("AiRateLimitGuard protects resource-heavy AI generation and evaluation endpoints", () => {
  const originalEnv = { ...process.env };
  try {
    process.env.AI_RATE_LIMIT_MAX = "2";
    process.env.AI_RATE_LIMIT_WINDOW_MS = "60000";
    const guard = new AiRateLimitGuard();

    const userCtx = createMockContext("10.0.0.1", { id: "interviewer-42" });
    assert.equal(guard.canActivate(userCtx as any), true);
    assert.equal(guard.canActivate(userCtx as any), true);

    // 3rd attempt exceeds budget
    assert.throws(
      () => guard.canActivate(userCtx as any),
      (err: any) => {
        assert.ok(err instanceof HttpException);
        assert.equal(err.getStatus(), 429);
        const body = err.getResponse() as any;
        assert.match(body?.message, /too many ai generation requests/i);
        return true;
      },
    );

    // Different user has independent quota
    const otherUserCtx = createMockContext("10.0.0.1", { id: "interviewer-99" });
    assert.equal(guard.canActivate(otherUserCtx as any), true);
  } finally {
    process.env = originalEnv;
  }
});

test("CandidateAccessRateLimitGuard protects access code brute force with sliding window", () => {
  const originalEnv = { ...process.env };
  try {
    process.env.ACCESS_CODE_RATE_LIMIT_MAX = "2";
    process.env.ACCESS_CODE_RATE_LIMIT_WINDOW_MS = "60000";
    const guard = new CandidateAccessRateLimitGuard();

    const ctx = createMockContext("203.0.113.50");
    assert.equal(guard.canActivate(ctx as any), true);
    assert.equal(guard.canActivate(ctx as any), true);

    assert.throws(
      () => guard.canActivate(ctx as any),
      (err: any) => {
        assert.ok(err instanceof HttpException);
        assert.equal(err.getStatus(), 429);
        return true;
      },
    );
  } finally {
    process.env = originalEnv;
  }
});

test("DraftRateLimitGuard and DraftChatRateLimitGuard maintain isolated user sliding windows", () => {
  const originalEnv = { ...process.env };
  try {
    process.env.DRAFT_RATE_LIMIT_MAX = "1";
    process.env.DRAFT_CHAT_RATE_LIMIT_MAX = "2";
    const draftGuard = new DraftRateLimitGuard();
    const chatGuard = new DraftChatRateLimitGuard();

    const ctx = createMockContext("10.0.0.5", { id: "designer-1" });

    // 1 draft allowed
    assert.equal(draftGuard.canActivate(ctx as any), true);
    assert.throws(() => draftGuard.canActivate(ctx as any), HttpException);

    // Chat refinement has distinct quota and does not block on draft exhaustion
    assert.equal(chatGuard.canActivate(ctx as any), true);
    assert.equal(chatGuard.canActivate(ctx as any), true);
    assert.throws(() => chatGuard.canActivate(ctx as any), HttpException);
  } finally {
    process.env = originalEnv;
  }
});
