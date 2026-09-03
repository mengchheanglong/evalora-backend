import "reflect-metadata";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { HttpStatus } from "@nestjs/common";
import {
  InMemoryRateLimitStore,
  resolveClientIp,
  GlobalRateLimitMiddleware,
} from "../src/common/rate-limiting";

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, any>,
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

test("InMemoryRateLimitStore accurately tracks tokens, remaining budget, and reset time", () => {
  const store = new InMemoryRateLimitStore();
  const limit = 5;
  const windowMs = 10_000;

  // First request
  const r1 = store.consume("192.168.1.1", limit, windowMs);
  assert.equal(r1.allowed, true);
  assert.equal(r1.limit, 5);
  assert.equal(r1.remaining, 4);
  assert.ok(r1.resetAt > Date.now());

  // Consume remaining
  store.consume("192.168.1.1", limit, windowMs);
  store.consume("192.168.1.1", limit, windowMs);
  store.consume("192.168.1.1", limit, windowMs);
  const r5 = store.consume("192.168.1.1", limit, windowMs);
  assert.equal(r5.allowed, true);
  assert.equal(r5.remaining, 0);

  // 6th request should be rejected
  const r6 = store.consume("192.168.1.1", limit, windowMs);
  assert.equal(r6.allowed, false);
  assert.equal(r6.remaining, 0);
  assert.ok(r6.retryAfterSeconds >= 1);

  // Different IP has independent budget
  const rOther = store.consume("192.168.1.2", limit, windowMs);
  assert.equal(rOther.allowed, true);
  assert.equal(rOther.remaining, 4);
});

test("InMemoryRateLimitStore resets and clears buckets on demand", () => {
  const store = new InMemoryRateLimitStore();
  store.consume("client-a", 1, 10_000);
  assert.equal(store.size(), 1);

  store.reset("client-a");
  assert.equal(store.size(), 0);

  store.consume("client-b", 1, 10_000);
  store.consume("client-c", 1, 10_000);
  assert.equal(store.size(), 2);

  store.clear();
  assert.equal(store.size(), 0);
});

test("resolveClientIp extracts Express req.ip or socket address with fallback", () => {
  assert.equal(resolveClientIp({ ip: "203.0.113.195" } as any), "203.0.113.195");
  assert.equal(
    resolveClientIp({ socket: { remoteAddress: "198.51.100.1" } } as any),
    "198.51.100.1",
  );
  assert.equal(resolveClientIp({} as any), "127.0.0.1");
});

test("GlobalRateLimitMiddleware allows requests within budget and attaches standard rate limit headers", () => {
  const middleware = new GlobalRateLimitMiddleware({ windowMs: 60_000, maxRequests: 50 });
  const req: any = { ip: "10.0.0.1", method: "GET" };
  const res = createMockResponse();

  let nextCalled = false;
  middleware.use(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.headers["x-ratelimit-limit"], 50);
  assert.equal(res.headers["x-ratelimit-remaining"], 49);
  assert.ok(res.headers["x-ratelimit-reset"] > 0);
});

test("GlobalRateLimitMiddleware skips CORS preflight OPTIONS requests", () => {
  const middleware = new GlobalRateLimitMiddleware({ windowMs: 60_000, maxRequests: 1 });
  const req: any = { ip: "10.0.0.2", method: "OPTIONS" };
  const res = createMockResponse();

  let nextCalled = false;
  middleware.use(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  // No rate limit header attached for OPTIONS
  assert.equal(res.headers["x-ratelimit-limit"], undefined);
});

test("GlobalRateLimitMiddleware rejects requests exceeding budget with HTTP 429 and Retry-After header", () => {
  const middleware = new GlobalRateLimitMiddleware({
    windowMs: 60_000,
    maxRequests: 2,
    message: "IP rate limit exceeded.",
  });
  const req: any = { ip: "10.0.0.99", method: "POST" };

  // 1st request
  const res1 = createMockResponse();
  let next1 = false;
  middleware.use(req, res1, () => {
    next1 = true;
  });
  assert.equal(next1, true);

  // 2nd request
  const res2 = createMockResponse();
  let next2 = false;
  middleware.use(req, res2, () => {
    next2 = true;
  });
  assert.equal(next2, true);

  // 3rd request should be blocked
  const res3 = createMockResponse();
  let next3 = false;
  middleware.use(req, res3, () => {
    next3 = true;
  });

  assert.equal(next3, false); // next was NOT called
  assert.equal(res3.statusCode, HttpStatus.TOO_MANY_REQUESTS);
  assert.equal(res3.body.statusCode, 429);
  assert.equal(res3.body.error, "Too Many Requests");
  assert.equal(res3.body.message, "IP rate limit exceeded.");
  assert.ok(res3.body.retryAfter >= 1);
  assert.ok(res3.headers["retry-after"] >= 1);
  assert.equal(res3.headers["x-ratelimit-remaining"], 0);

  // Another IP should still be allowed through
  const reqOther: any = { ip: "10.0.0.100", method: "POST" };
  const resOther = createMockResponse();
  let nextOther = false;
  middleware.use(reqOther, resOther, () => {
    nextOther = true;
  });
  assert.equal(nextOther, true);
  assert.equal(resOther.statusCode, 200);
});
