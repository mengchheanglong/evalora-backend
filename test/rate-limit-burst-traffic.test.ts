import "reflect-metadata";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { HttpStatus, HttpException } from "@nestjs/common";
import {
  GlobalRateLimitMiddleware,
  BaseRouteRateLimitGuard,
  SlidingWindowRateLimitStore,
  RATE_LIMIT_HEADERS,
} from "../src/common/rate-limiting";
import { AuthRateLimitGuard } from "../src/modules/auth/auth-rate-limit.guard";
import { CodeRateLimitGuard } from "../src/modules/code/guards/rate-limit.guard";
import { AiRateLimitGuard } from "../src/modules/ai/guards/ai-rate-limit.guard";

function createMockResponse() {
  const headers: Record<string, any> = {};
  const res: any = {
    statusCode: 200,
    headers,
    body: null,
    setHeader(name: string, value: any) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  return res;
}

function createMockContext(ip = "127.0.0.1", user?: { id: string }) {
  const res = createMockResponse();
  const req: any = {
    ip,
    user,
    socket: { remoteAddress: ip },
  };

  return {
    context: {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as any,
    req,
    res,
  };
}

test("Simulated burst traffic against global middleware enforces limits and returns informative 429", () => {
  const limit = 5;
  const windowMs = 10_000;
  const middleware = new GlobalRateLimitMiddleware({
    windowMs,
    maxRequests: limit,
    message: "Rate limit exceeded.",
  });

  const responses: any[] = [];
  const burstCount = 15;

  // Simulate 15 rapid consecutive burst requests from same client IP
  for (let i = 0; i < burstCount; i++) {
    const req: any = { ip: "192.168.1.100", method: "POST" };
    const res = createMockResponse();
    let nextCalled = false;

    middleware.use(req, res, () => {
      nextCalled = true;
    });

    responses.push({ nextCalled, res });
  }

  // First 5 requests must pass
  for (let i = 0; i < 5; i++) {
    const { nextCalled, res } = responses[i];
    assert.equal(nextCalled, true, `Request ${i + 1} should be permitted`);
    assert.equal(res.headers["x-ratelimit-limit"], 5);
    assert.equal(res.headers["x-ratelimit-remaining"], 4 - i);
    assert.ok(res.headers["x-ratelimit-reset"] > 0);
    assert.equal(res.headers["retry-after"], undefined);
  }

  // Remaining 10 requests must be rejected with 429 and informative retry payload
  for (let i = 5; i < burstCount; i++) {
    const { nextCalled, res } = responses[i];
    assert.equal(nextCalled, false, `Burst request ${i + 1} should be rejected`);
    assert.equal(res.statusCode, HttpStatus.TOO_MANY_REQUESTS);
    assert.equal(res.headers["x-ratelimit-limit"], 5);
    assert.equal(res.headers["x-ratelimit-remaining"], 0);
    assert.ok(res.headers["retry-after"] >= 1);

    // Informative 429 response body verification
    assert.equal(res.body.statusCode, 429);
    assert.equal(res.body.error, "Too Many Requests");
    assert.match(res.body.message, /Rate limit exceeded\. Please retry in \d+ seconds\./);
    assert.ok(res.body.retryAfter >= 1);
    assert.equal(res.body.limit, 5);
    assert.equal(res.body.remaining, 0);
    assert.ok(res.body.resetAt);
    assert.ok(!isNaN(Date.parse(res.body.resetAt)));
  }
});

test("Simulated burst traffic isolates quotas between concurrent clients", () => {
  const middleware = new GlobalRateLimitMiddleware({
    windowMs: 60_000,
    maxRequests: 3,
  });

  // Client A fires a burst of 5 requests (exceeding budget)
  for (let i = 0; i < 3; i++) {
    const res = createMockResponse();
    let nextCalled = false;
    middleware.use({ ip: "client-a", method: "GET" } as any, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  }
  const clientABlockedRes = createMockResponse();
  let clientABlockedNext = false;
  middleware.use({ ip: "client-a", method: "GET" } as any, clientABlockedRes, () => {
    clientABlockedNext = true;
  });
  assert.equal(clientABlockedNext, false);
  assert.equal(clientABlockedRes.statusCode, 429);

  // Client B fires concurrent burst — must be completely uninhibited
  for (let i = 0; i < 3; i++) {
    const res = createMockResponse();
    let nextCalled = false;
    middleware.use({ ip: "client-b", method: "GET" } as any, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true, `Client B request ${i + 1} should succeed`);
    assert.equal(res.headers["x-ratelimit-remaining"], 2 - i);
  }
});

test("AuthRateLimitGuard returns standard headers and informative instructions under burst attack", () => {
  const originalEnv = { ...process.env };
  try {
    process.env.AUTH_RATE_LIMIT_MAX = "3";
    process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";
    const guard = new AuthRateLimitGuard();

    // 3 rapid login attempts succeed
    for (let i = 0; i < 3; i++) {
      const { context, res } = createMockContext("attacker-ip");
      assert.equal(guard.canActivate(context), true);
      assert.equal(res.headers["x-ratelimit-limit"], 3);
      assert.equal(res.headers["x-ratelimit-remaining"], 2 - i);
    }

    // 4th burst request triggers 429 with informative payload and headers
    const { context: blockedCtx, res: blockedRes } = createMockContext("attacker-ip");
    assert.throws(
      () => guard.canActivate(blockedCtx),
      (err: any) => {
        assert.ok(err instanceof HttpException);
        assert.equal(err.getStatus(), 429);
        const payload = err.getResponse() as any;
        assert.match(payload?.message, /Too many authentication attempts\. Please wait a moment and try again\. Please retry in \d+ seconds\./i);
        assert.ok(payload?.retryAfter >= 1);
        assert.equal(payload?.limit, 3);
        assert.equal(payload?.remaining, 0);
        assert.ok(payload?.resetAt);
        return true;
      },
    );

    assert.equal(blockedRes.headers["x-ratelimit-limit"], 3);
    assert.equal(blockedRes.headers["x-ratelimit-remaining"], 0);
    assert.ok(blockedRes.headers["retry-after"] >= 1);
  } finally {
    process.env = originalEnv;
  }
});

test("CodeRateLimitGuard and AiRateLimitGuard provide clear retry instructions under heavy burst traffic", () => {
  const originalEnv = { ...process.env };
  try {
    process.env.CODE_RATE_LIMIT_MAX = "2";
    process.env.CODE_RATE_LIMIT_WINDOW_MS = "30000";
    process.env.AI_RATE_LIMIT_MAX = "2";
    process.env.AI_RATE_LIMIT_WINDOW_MS = "30000";

    const codeGuard = new CodeRateLimitGuard();
    const aiGuard = new AiRateLimitGuard();

    // Code execution burst
    createMockContext("runner-ip");
    assert.equal(codeGuard.canActivate(createMockContext("runner-ip").context), true);
    assert.equal(codeGuard.canActivate(createMockContext("runner-ip").context), true);
    const { context: codeBlockedCtx, res: codeBlockedRes } = createMockContext("runner-ip");
    assert.throws(
      () => codeGuard.canActivate(codeBlockedCtx),
      (err: any) => {
        const payload = err.getResponse() as any;
        assert.match(payload?.message, /Too many code execution requests\. Please slow down and try again shortly\. Please retry in \d+ seconds\./i);
        assert.ok(payload?.retryAfter >= 1);
        return true;
      },
    );
    assert.ok(codeBlockedRes.headers["retry-after"] >= 1);

    // AI generation burst
    assert.equal(aiGuard.canActivate(createMockContext("ai-user", { id: "user-ai-1" }).context), true);
    assert.equal(aiGuard.canActivate(createMockContext("ai-user", { id: "user-ai-1" }).context), true);
    const { context: aiBlockedCtx, res: aiBlockedRes } = createMockContext("ai-user", { id: "user-ai-1" });
    assert.throws(
      () => aiGuard.canActivate(aiBlockedCtx),
      (err: any) => {
        const payload = err.getResponse() as any;
        assert.match(payload?.message, /Too many AI generation requests\. Please slow down and try again shortly\. Please retry in \d+ seconds\./i);
        assert.ok(payload?.retryAfter >= 1);
        return true;
      },
    );
    assert.ok(aiBlockedRes.headers["retry-after"] >= 1);
  } finally {
    process.env = originalEnv;
  }
});
