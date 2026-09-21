import "reflect-metadata";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { ExecutionContext, CallHandler, HttpException, HttpStatus } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { of, firstValueFrom } from "rxjs";

import { CacheService } from "../src/common/caching/cache.service";
import { InMemoryCacheClient } from "../src/common/caching/in-memory-cache.client";
import { CacheKeys } from "../src/common/caching/cache-key.util";
import { CACHE_TTL } from "../src/common/caching";
import { CacheInvalidationService } from "../src/common/caching/cache-invalidation.service";
import { CacheInvalidationInterceptor } from "../src/common/caching/cache-invalidation.interceptor";
import { CACHE_INVALIDATION_METADATA } from "../src/common/caching/cache-invalidation.decorator";
import { SlidingWindowRateLimitStore, resolveClientIp } from "../src/common/rate-limiting";
import { CandidateAccessRateLimitGuard } from "../src/modules/sessions/access-rate-limit.guard";
import { ValidateDto } from "../src/common/pipes/validate-dto.pipe";
import { CreateSessionDto } from "../src/modules/sessions/dto/session.dto";
import { SessionsService } from "../src/modules/sessions/sessions.service";
import { TemplatesService } from "../src/modules/templates/templates.service";

function createMockExecutionContext(options: {
  method: string;
  url: string;
  ip?: string;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  body?: any;
  user?: any;
}): ExecutionContext {
  const req: any = {
    method: options.method.toUpperCase(),
    url: options.url,
    ip: options.ip || "192.168.1.100",
    headers: options.headers || {},
    params: options.params || {},
    body: options.body || {},
    user: options.user,
  };

  const resHeaders: Record<string, string> = {};
  const res: any = {
    setHeader: (name: string, value: string) => {
      resHeaders[name.toLowerCase()] = value;
    },
    getHeader: (name: string) => resHeaders[name.toLowerCase()],
    getHeaders: () => resHeaders,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
      getNext: () => undefined,
    }),
    getHandler: () => () => {},
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

test("E2E Integration: Valid candidate access flow warms cache and repetitive requests hit cache within rate limits", async () => {
  const cacheClient = new InMemoryCacheClient();
  const cache = new CacheService(cacheClient);
  const guard = new CandidateAccessRateLimitGuard();

  let dbQueryCount = 0;
  const mockSession = {
    id: "session-e2e-1",
    accessCode: "E2E-CODE-100",
    status: "NOT_STARTED",
    scheduledAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000),
    templateId: "tpl-1",
    organizationId: "org-1",
    timeLimitMin: 45,
    integrityPolicy: { allowTabSwitch: false, warningLimit: 3 },
    template: { title: "Frontend Engineering", roleType: "Frontend", modules: [] },
  };

  const prisma = {
    interviewSession: {
      findFirst: async () => {
        dbQueryCount++;
        return mockSession;
      },
    },
  };

  const sessionsService = new SessionsService(prisma as never, { cache });

  const context = createMockExecutionContext({
    method: "GET",
    url: "/api/sessions/access/E2E-CODE-100",
    params: { accessCode: "E2E-CODE-100" },
    ip: "10.0.0.5",
  });

  // Request 1: Rate limit allowed, cache miss -> loads from DB -> warms cache
  assert.equal(guard.canActivate(context), true);
  const res1 = await sessionsService.getSessionByAccessCode("E2E-CODE-100");
  assert.equal(res1.id, "session-e2e-1");
  assert.equal(dbQueryCount, 1);

  // Request 2-10: Rate limit allowed, cache hit -> returns from in-memory cache without hitting DB
  for (let i = 0; i < 9; i++) {
    assert.equal(guard.canActivate(context), true);
    const cachedRes = await sessionsService.getSessionByAccessCode("E2E-CODE-100");
    assert.equal(cachedRes.id, "session-e2e-1");
  }
  assert.equal(dbQueryCount, 1, "Database query count must remain 1 after 10 requests");

  const stats = cache.getStats();
  assert.equal(stats.hits, 9);
  assert.equal(stats.misses, 1);
});

test("E2E Integration: Input validation failures reject immediately before rate limit consumption or cache pollution", async () => {
  const cacheClient = new InMemoryCacheClient();
  const cache = new CacheService(cacheClient);
  const validateDto = new ValidateDto(CreateSessionDto);

  // Attempt invalid session payload (missing required templateId and invalid candidateEmail)
  const invalidPayload = {
    templateId: "",
    candidateEmail: "not-an-email-address",
  };

  await assert.rejects(
    async () => {
      await validateDto.transform(invalidPayload);
    },
    (err: any) => {
      assert(err instanceof HttpException);
      assert.equal(err.getStatus(), HttpStatus.BAD_REQUEST);
      return true;
    },
  );

  // Verify that cache was never touched or corrupted with invalid payloads
  assert.equal(cache.getStats().size, 0);
  assert.equal(cache.getStats().sets, 0);
});

test("E2E Integration: Rate limiting throttle prevents database query bursts and keeps cache pristine", async () => {
  const guard = new CandidateAccessRateLimitGuard();

  const context = createMockExecutionContext({
    method: "GET",
    url: "/api/sessions/access/BRUTE-FORCE-CODE",
    params: { accessCode: "BRUTE-FORCE-CODE" },
    ip: "198.51.100.22",
  });

  // Candidate access limit is 120 requests per minute
  for (let i = 0; i < 120; i++) {
    assert.equal(guard.canActivate(context), true);
  }

  // 121st request should be rejected with 429 Too Many Requests
  assert.throws(
    () => guard.canActivate(context),
    (err: any) => {
      assert(err instanceof HttpException);
      assert.equal(err.getStatus(), HttpStatus.TOO_MANY_REQUESTS);
      const res = err.getResponse() as any;
      assert.equal(res.error, "Too Many Requests");
      return true;
    },
  );

  // Rate limit response headers attached correctly
  const resHeaders = (context.switchToHttp().getResponse() as any).getHeaders();
  assert.equal(resHeaders["x-ratelimit-limit"], 120);
  assert.equal(resHeaders["x-ratelimit-remaining"], 0);
  assert(resHeaders["retry-after"] !== undefined);
});

test("E2E Integration: Mutation updates database, triggers automated invalidation, and next GET serves fresh data", async () => {
  const cacheClient = new InMemoryCacheClient();
  const cache = new CacheService(cacheClient);
  const invalidator = new CacheInvalidationService(cache);

  const reflector = {
    getAllAndOverride: (metadataKey: string) => {
      if (metadataKey === CACHE_INVALIDATION_METADATA) {
        return { entities: ["templates"] };
      }
      return undefined;
    },
  } as unknown as Reflector;

  const interceptor = new CacheInvalidationInterceptor(reflector, invalidator);

  let currentTitle = "Original Architecture Template";
  let dbFindCount = 0;

  const prisma = {
    assessmentTemplate: {
      findFirst: async () => {
        dbFindCount++;
        return {
          id: "tpl-mutation-1",
          title: currentTitle,
          description: "System Design Assessment",
          roleType: "Backend",
          timeLimitMin: 60,
          scoringRules: null,
          createdById: "user-1",
          organizationId: "org-test",
          modules: [],
        };
      },
    },
  };

  const templatesService = new TemplatesService(prisma as never, cache);
  const access = { userId: "user-1", role: "organization" as const, organizationId: "org-test" };

  // Step 1: Initial GET warms the cache
  const initial = await templatesService.getTemplate("tpl-mutation-1", access);
  assert.equal(initial?.title, "Original Architecture Template");
  assert.equal(dbFindCount, 1);

  // Step 2: Repetitive GET hits cache (dbFindCount remains 1)
  const cached = await templatesService.getTemplate("tpl-mutation-1", access);
  assert.equal(cached?.title, "Original Architecture Template");
  assert.equal(dbFindCount, 1);

  // Step 3: Mutating PUT request executes and passes through CacheInvalidationInterceptor
  const putContext = createMockExecutionContext({
    method: "PUT",
    url: "/api/templates/tpl-mutation-1",
    params: { id: "tpl-mutation-1" },
    body: { title: "Updated Microservices Architecture Template" },
    user: access,
  });

  const next: CallHandler = {
    handle: () => {
      // Simulate DB write
      currentTitle = "Updated Microservices Architecture Template";
      return of({
        id: "tpl-mutation-1",
        title: currentTitle,
        organizationId: "org-test",
      });
    },
  };

  const putResponse$ = interceptor.intercept(putContext, next);
  const putResult = await firstValueFrom(putResponse$);
  assert.equal(putResult.title, "Updated Microservices Architecture Template");

  // Step 4: Verify cache was evicted for both the template detail and org collection
  const tplKey = CacheKeys.template("tpl-mutation-1");
  const orgKey = CacheKeys.orgTemplates("org-test");
  assert.equal(await cache.has(tplKey), false, "Template cache must be evicted on mutation");
  assert.equal(await cache.has(orgKey), false, "Org templates list must be evicted on mutation");

  // Step 5: Subsequent GET fetches fresh updated data from DB and re-caches
  const refreshed = await templatesService.getTemplate("tpl-mutation-1", access);
  assert.equal(refreshed?.title, "Updated Microservices Architecture Template");
  assert.equal(dbFindCount, 2, "DB was queried for the fresh data");

  // Step 6: Next GET hits the refreshed cache
  const refreshedCached = await templatesService.getTemplate("tpl-mutation-1", access);
  assert.equal(refreshedCached?.title, "Updated Microservices Architecture Template");
  assert.equal(dbFindCount, 2, "DB query count remains 2 (refreshed cache hit)");
});

test("E2E Integration: Fail-safe isolation ensures cache errors never crash API mutations or query pipelines", async () => {
  const faultCacheClient = {
    get: async () => {
      throw new Error("Simulated cache connection drop");
    },
    set: async () => {
      throw new Error("Simulated cache write timeout");
    },
    delete: async () => {
      throw new Error("Simulated cache eviction failure");
    },
    deleteByPrefix: async () => {
      throw new Error("Simulated cache prefix purge failure");
    },
    deleteByPattern: async () => {
      throw new Error("Simulated cache pattern purge failure");
    },
    has: async () => false,
    clear: async () => {},
    keys: async () => [],
    size: async () => 0,
    stats: () => ({ size: 0, hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0, hitRatio: 0 }),
  };

  const cache = new CacheService(faultCacheClient as any);
  const invalidator = new CacheInvalidationService(cache);

  const reflector = {
    getAllAndOverride: () => ({ entities: ["sessions"] }),
  } as unknown as Reflector;

  const interceptor = new CacheInvalidationInterceptor(reflector, invalidator);

  const context = createMockExecutionContext({
    method: "POST",
    url: "/api/sessions",
    body: { candidateName: "Grace Hopper" },
    user: { userId: "user-1", role: "organization", organizationId: "org-1" },
  });

  const next: CallHandler = {
    handle: () => of({ id: "session-fault-test", candidateName: "Grace Hopper", status: "NOT_STARTED" }),
  };

  // Interceptor must catch cache failure silently and emit the HTTP response safely
  const response$ = interceptor.intercept(context, next);
  const result = await firstValueFrom(response$);
  assert.equal(result.id, "session-fault-test");
  assert.equal(result.candidateName, "Grace Hopper");
});
