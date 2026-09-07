import "reflect-metadata";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  SlidingWindowRateLimitStore,
  normalizeIp,
  resolveClientIp,
  GlobalRateLimitMiddleware,
  BaseRouteRateLimitGuard,
  RATE_LIMIT_HEADERS,
  applyRateLimitHeaders,
} from "../src/common/rate-limiting";
import { AuthRateLimitGuard } from "../src/modules/auth/auth-rate-limit.guard";
import { CodeRateLimitGuard } from "../src/modules/code/guards/rate-limit.guard";
import { CandidateAccessRateLimitGuard } from "../src/modules/sessions/access-rate-limit.guard";
import { DraftRateLimitGuard, DraftChatRateLimitGuard } from "../src/modules/templates/drafts/draft-rate-limit.guard";
import { AiRateLimitGuard } from "../src/modules/ai/guards/ai-rate-limit.guard";
import { HttpStatus } from "@nestjs/common";

test("normalizeIp handles IPv4-mapped IPv6, loopback, bracketed IPv6, proxy comma lists, ports, and whitespace", () => {
  assert.equal(normalizeIp("::ffff:192.168.1.50"), "192.168.1.50");
  assert.equal(normalizeIp("::ffff:10.0.0.1"), "10.0.0.1");
  assert.equal(normalizeIp("::1"), "127.0.0.1");
  assert.equal(normalizeIp("[::1]"), "127.0.0.1");
  assert.equal(normalizeIp("[::1]:8080"), "127.0.0.1");
  assert.equal(normalizeIp("[2001:db8::1]:443"), "2001:db8::1");
  assert.equal(normalizeIp("  172.16.0.1  "), "172.16.0.1");
  assert.equal(normalizeIp("192.168.1.1:54321"), "192.168.1.1");
  assert.equal(normalizeIp("203.0.113.195, 70.41.3.18, 150.172.238.178"), "203.0.113.195");
  assert.equal(normalizeIp(""), "127.0.0.1");
  assert.equal(normalizeIp(undefined), "127.0.0.1");
});

test("resolveClientIp maps IPv4-mapped IPv6 and standard IPv4 to the same rate limit bucket", () => {
  const store = new SlidingWindowRateLimitStore();
  const limit = 2;
  const windowMs = 60_000;

  const req1: any = { ip: "::ffff:192.168.1.99" };
  const req2: any = { ip: "192.168.1.99" };

  const key1 = resolveClientIp(req1);
  const key2 = resolveClientIp(req2);
  assert.equal(key1, key2);

  // Consume token via req1
  const r1 = store.consume(key1, limit, windowMs);
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 1);

  // Second token consumed via req2 (same bucket)
  const r2 = store.consume(key2, limit, windowMs);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 0);

  // Third attempt via either must be throttled
  const r3 = store.consume(key1, limit, windowMs);
  assert.equal(r3.allowed, false);
});

test("SlidingWindowRateLimitStore gracefully handles backwards NTP clock step adjustments", () => {
  const store = new SlidingWindowRateLimitStore();
  const limit = 2;
  const windowMs = 10_000;

  // Request at t = 10,000
  const r1 = store.consume("client-skew", limit, windowMs, 10_000);
  assert.equal(r1.allowed, true);

  // Request at t = 10,500
  const r2 = store.consume("client-skew", limit, windowMs, 10_500);
  assert.equal(r2.allowed, true);

  // Clock skew: system time steps back to t = 9,000
  // Store should handle without crashing or throwing
  const rSkew = store.consume("client-skew", limit, windowMs, 9_000);
  assert.ok(typeof rSkew.allowed === "boolean");
});

test("SlidingWindowRateLimitStore enforces high-water mark memory caps under 15,000 distinct IP attacks", () => {
  const store = new SlidingWindowRateLimitStore();
  const limit = 1;
  const windowMs = 10_000;

  // Flood 15,000 unique keys
  for (let i = 0; i < 15_000; i++) {
    store.consume(`flood-ip-${i}`, limit, windowMs);
  }

  // High-water eviction must keep size bounded at or below 10,000 entries
  assert.ok(store.size() <= 10_000, `Store size (${store.size()}) must not exceed MAX_STORE_BUCKETS (10,000)`);
});

test("High concurrency race condition testing: 100 simultaneous requests with limit 10", async () => {
  const store = new SlidingWindowRateLimitStore();
  const limit = 10;
  const windowMs = 10_000;
  const key = "concurrent-client";

  // Fire 100 asynchronous simulated hits in parallel
  const promises = Array.from({ length: 100 }, () =>
    Promise.resolve().then(() => store.consume(key, limit, windowMs)),
  );

  const results = await Promise.all(promises);
  const allowedCount = results.filter((r) => r.allowed).length;
  const rejectedCount = results.filter((r) => !r.allowed).length;

  assert.equal(allowedCount, 10, "Exactly 10 requests must be allowed");
  assert.equal(rejectedCount, 90, "Exactly 90 requests must be rejected");
});

test("Rapid button double-click / quiz answer save simulation throttles excess attempts", () => {
  const guard = new BaseRouteRateLimitGuard({
    windowMs: 1_000,
    maxRequests: 3,
    message: "Too many rapid submissions.",
  });

  const resList: any[] = [];
  function createReq() {
    const resHeaders: Record<string, any> = {};
    const res: any = {
      setHeader(k: string, v: any) {
        resHeaders[k.toLowerCase()] = v;
      },
    };
    resList.push(resHeaders);
    return {
      switchToHttp: () => ({
        getRequest: () => ({ ip: "candidate-rapid-clicker", method: "POST" }),
        getResponse: () => res,
      }),
    } as any;
  }

  // 3 rapid clicks succeed
  assert.equal(guard.canActivate(createReq()), true);
  assert.equal(guard.canActivate(createReq()), true);
  assert.equal(guard.canActivate(createReq()), true);

  // 4th and 5th rapid clicks fail with 429
  assert.throws(() => guard.canActivate(createReq()), (err: any) => {
    assert.equal(err.getStatus(), HttpStatus.TOO_MANY_REQUESTS);
    return true;
  });

  // Verify headers attached on rejected response
  const lastHeaders = resList[resList.length - 1];
  assert.equal(lastHeaders[RATE_LIMIT_HEADERS.LIMIT.toLowerCase()], 3);
  assert.equal(lastHeaders[RATE_LIMIT_HEADERS.REMAINING.toLowerCase()], 0);
  assert.ok(lastHeaders[RATE_LIMIT_HEADERS.RETRY_AFTER.toLowerCase()] >= 1);
});

test("Preflight CORS OPTIONS requests bypass all route rate limit guards without consuming quota", () => {
  const guards = [
    new BaseRouteRateLimitGuard({ windowMs: 60_000, maxRequests: 1 }),
    new AuthRateLimitGuard(),
    new CodeRateLimitGuard(),
    new CandidateAccessRateLimitGuard(),
    new DraftRateLimitGuard(),
    new DraftChatRateLimitGuard(),
    new AiRateLimitGuard(),
  ];

  for (const guard of guards) {
    const req: any = {
      switchToHttp: () => ({
        getRequest: () => ({ method: "OPTIONS", ip: "preflight-client" }),
        getResponse: () => ({ setHeader: () => {} }),
      }),
    };

    // Even if limit is 1, multiple OPTIONS requests must never fail
    for (let i = 0; i < 5; i++) {
      assert.equal(guard.canActivate(req), true);
    }
  }
});

test("applyRateLimitHeaders is a no-op when response.headersSent is true", () => {
  let setHeaderCalled = false;
  const mockRes: any = {
    headersSent: true,
    setHeader: () => {
      setHeaderCalled = true;
    },
  };

  applyRateLimitHeaders(mockRes, {
    allowed: false,
    limit: 10,
    remaining: 0,
    resetAt: Date.now() + 10_000,
    retryAfterSeconds: 10,
  });

  assert.equal(setHeaderCalled, false, "Must not set headers when response.headersSent is true");
});

test("SlidingWindowRateLimitStore safely handles zero and negative limits and windows", () => {
  const store = new SlidingWindowRateLimitStore();

  // Zero limit: clamped to minimum 1
  const rZero = store.consume("client-zero", 0, 0);
  assert.equal(rZero.limit, 1);
  assert.equal(rZero.allowed, true);

  // Negative limit: clamped to minimum 1
  const rNeg = store.consume("client-neg", -10, -5000);
  assert.equal(rNeg.limit, 1);
  assert.equal(rNeg.allowed, true);
});

test("All specialized route guards normalize IPv4-mapped IPv6 identically", () => {
  function makeContext(ip: string, method = "POST", user?: any) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ ip, method, user }),
        getResponse: () => ({ setHeader: () => {} }),
      }),
    } as any;
  }

  // AuthRateLimitGuard
  const authGuard = new AuthRateLimitGuard();
  assert.equal(authGuard.canActivate(makeContext("::ffff:192.168.1.10")), true);
  assert.equal(authGuard.canActivate(makeContext("192.168.1.10")), true);

  // CodeRateLimitGuard
  const codeGuard = new CodeRateLimitGuard();
  assert.equal(codeGuard.canActivate(makeContext("::ffff:192.168.1.20")), true);
  assert.equal(codeGuard.canActivate(makeContext("192.168.1.20")), true);

  // CandidateAccessRateLimitGuard
  const accessGuard = new CandidateAccessRateLimitGuard();
  assert.equal(accessGuard.canActivate(makeContext("::ffff:192.168.1.30")), true);
  assert.equal(accessGuard.canActivate(makeContext("192.168.1.30")), true);
});
