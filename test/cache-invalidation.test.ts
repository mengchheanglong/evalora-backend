import { test } from "node:test";
import { strict as assert } from "node:assert";
import { of, throwError, firstValueFrom } from "rxjs";
import { ExecutionContext, CallHandler } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { InMemoryCacheClient } from "../src/common/caching/in-memory-cache.client";
import { CacheService } from "../src/common/caching/cache.service";
import { CacheKeys, buildCacheKey } from "../src/common/caching/cache-key.util";
import { CacheNamespace } from "../src/common/caching/cache.types";
import { CacheInvalidationService, CacheInvalidationEvent } from "../src/common/caching/cache-invalidation.service";
import { CacheInvalidationInterceptor } from "../src/common/caching/cache-invalidation.interceptor";
import { InvalidateCache, InvalidateCacheOptions } from "../src/common/caching/cache-invalidation.decorator";

// Helper to create mock ExecutionContext
function createMockExecutionContext(
  method: string,
  url: string,
  params: Record<string, any> = {},
  body: Record<string, any> = {},
  user: Record<string, any> = {},
): ExecutionContext {
  const req = {
    method,
    url,
    params,
    body,
    user,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ statusCode: 200 }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

test("CacheInvalidationService: invalidateTemplate purges template detail, org lists, and analytics", async () => {
  const client = new InMemoryCacheClient();
  const cache = new CacheService(client);
  const invalidator = new CacheInvalidationService(cache);

  const tplKey = CacheKeys.template("tpl-100");
  const orgListKey = CacheKeys.orgTemplates("org-alpha");
  const allListKey = buildCacheKey(CacheNamespace.TEMPLATES, "all");
  const analyticsSummaryKey = CacheKeys.analyticsSummary("org-alpha");
  const analyticsTplKey = CacheKeys.analyticsTemplate("org-alpha", "tpl-100");

  // Prime the cache with entries
  await cache.set(tplKey, { title: "Original Title" });
  await cache.set(orgListKey, [{ id: "tpl-100" }]);
  await cache.set(allListKey, [{ id: "tpl-100" }]);
  await cache.set(analyticsSummaryKey, { totalTemplates: 1 });
  await cache.set(analyticsTplKey, { avgScore: 4.5 });

  assert.ok(await cache.has(tplKey));
  assert.ok(await cache.has(orgListKey));
  assert.ok(await cache.has(allListKey));
  assert.ok(await cache.has(analyticsSummaryKey));
  assert.ok(await cache.has(analyticsTplKey));

  // Invalidate
  await invalidator.invalidateTemplate("tpl-100", "org-alpha");

  // All relevant keys should be evicted
  assert.equal(await cache.has(tplKey), false);
  assert.equal(await cache.has(orgListKey), false);
  assert.equal(await cache.has(allListKey), false);
  assert.equal(await cache.has(analyticsSummaryKey), false);
  assert.equal(await cache.has(analyticsTplKey), false);
});

test("CacheInvalidationService: invalidateSession purges session, responses, candidate access, and health", async () => {
  const client = new InMemoryCacheClient();
  const cache = new CacheService(cacheClientSafe(client));
  const invalidator = new CacheInvalidationService(cache);

  const sessionKey = CacheKeys.session("sess-1");
  const responsesKey = CacheKeys.sessionResponses("sess-1");
  const accessKey = CacheKeys.sessionAccess("EVAL-1234");
  const healthKey = CacheKeys.systemHealth();
  const orgAnalyticsKey = CacheKeys.analyticsSummary("org-beta");

  await cache.set(sessionKey, { status: "not_started" });
  await cache.set(responsesKey, [{ answer: "A" }]);
  await cache.set(accessKey, { valid: true });
  await cache.set(healthKey, { status: "operational" });
  await cache.set(orgAnalyticsKey, { totalSessions: 5 });

  // Invalidate
  await invalidator.invalidateSession("sess-1", "EVAL-1234", "org-beta");

  assert.equal(await cache.has(sessionKey), false);
  assert.equal(await cache.has(responsesKey), false);
  assert.equal(await cache.has(accessKey), false);
  assert.equal(await cache.has(healthKey), false);
  assert.equal(await cache.has(orgAnalyticsKey), false);
});

test("CacheInvalidationService: registerHook notifies listeners with event metadata", async () => {
  const client = new InMemoryCacheClient();
  const cache = new CacheService(client);
  const invalidator = new CacheInvalidationService(cache);

  const capturedEvents: CacheInvalidationEvent[] = [];
  const unsubscribe = invalidator.registerHook((event) => {
    capturedEvents.push(event);
  });

  await invalidator.invalidateTemplate("tpl-hook", "org-hook");
  assert.equal(capturedEvents.length, 1);
  assert.equal(capturedEvents[0].entity, "templates");
  assert.equal(capturedEvents[0].id, "tpl-hook");
  assert.equal(capturedEvents[0].orgId, "org-hook");
  assert.ok(capturedEvents[0].keys.includes(CacheKeys.template("tpl-hook")));

  unsubscribe();

  // After unsubscribe, no further events captured
  await invalidator.invalidateTemplate("tpl-hook-2", "org-hook");
  assert.equal(capturedEvents.length, 1);
});

test("CacheInvalidationInterceptor: ignores non-mutating GET requests", async () => {
  const client = new InMemoryCacheClient();
  const cache = new CacheService(client);
  const invalidator = new CacheInvalidationService(cache);
  const reflector = new Reflector();

  const interceptor = new CacheInvalidationInterceptor(reflector, invalidator);

  const testKey = "evalora:templates:test";
  await cache.set(testKey, { data: "cached" });

  const context = createMockExecutionContext("GET", "/api/templates");
  const next: CallHandler = {
    handle: () => of({ result: "ok" }),
  };

  const response$ = interceptor.intercept(context, next);
  const result = await firstValueFrom(response$);
  assert.deepEqual(result, { result: "ok" });

  // Cache remains untouched on GET
  assert.ok(await cache.has(testKey));
});

test("CacheInvalidationInterceptor: automatically purges template caches on POST/PUT mutation", async () => {
  const client = new InMemoryCacheClient();
  const cache = new CacheService(client);
  const invalidator = new CacheInvalidationService(cache);

  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === "evalora:cache_invalidation") {
        return { entities: ["templates"] } as InvalidateCacheOptions;
      }
      return undefined;
    },
  } as unknown as Reflector;

  const interceptor = new CacheInvalidationInterceptor(reflector, invalidator);

  // Prime cache
  const tplKey = CacheKeys.template("tpl-created-1");
  const orgListKey = CacheKeys.orgTemplates("org-99");
  await cache.set(tplKey, { name: "Before" });
  await cache.set(orgListKey, [{ id: "tpl-created-1" }]);

  // Simulate PUT /api/templates/tpl-created-1
  const context = createMockExecutionContext(
    "PUT",
    "/api/templates/tpl-created-1",
    { id: "tpl-created-1" },
    { title: "Updated Title" },
    { organizationId: "org-99" },
  );

  const next: CallHandler = {
    handle: () => of({ id: "tpl-created-1", organizationId: "org-99", title: "Updated Title" }),
  };

  const response$ = interceptor.intercept(context, next);
  await firstValueFrom(response$);

  // Both the template detail and org templates collection are now invalidated
  assert.equal(await cache.has(tplKey), false);
  assert.equal(await cache.has(orgListKey), false);
});

test("CacheInvalidationInterceptor: supports dynamic key resolvers and explicit prefixes/patterns", async () => {
  const client = new InMemoryCacheClient();
  const cache = new CacheService(client);
  const invalidator = new CacheInvalidationService(cache);

  const reflector = {
    getAllAndOverride: () =>
      ({
        keys: [(req: any) => `evalora:custom:${req.params.code}`],
        prefixes: ["evalora:prefix-test:"],
      }) as InvalidateCacheOptions,
  } as unknown as Reflector;

  const interceptor = new CacheInvalidationInterceptor(reflector, invalidator);

  const customKey = "evalora:custom:XYZ";
  const prefixedKey1 = "evalora:prefix-test:item-1";
  const prefixedKey2 = "evalora:prefix-test:item-2";
  const untouchedKey = "evalora:other:item-3";

  await cache.set(customKey, "val1");
  await cache.set(prefixedKey1, "val2");
  await cache.set(prefixedKey2, "val3");
  await cache.set(untouchedKey, "val4");

  const context = createMockExecutionContext("POST", "/api/custom/XYZ", { code: "XYZ" });
  const next: CallHandler = {
    handle: () => of({ success: true }),
  };

  await firstValueFrom(interceptor.intercept(context, next));

  assert.equal(await cache.has(customKey), false);
  assert.equal(await cache.has(prefixedKey1), false);
  assert.equal(await cache.has(prefixedKey2), false);
  assert.equal(await cache.has(untouchedKey), true, "Unrelated key should not be evicted");
});

test("CacheInvalidationInterceptor: does not invalidate on failed requests (e.g. 400/500 errors)", async () => {
  const client = new InMemoryCacheClient();
  const cache = new CacheService(client);
  const invalidator = new CacheInvalidationService(cache);

  const reflector = {
    getAllAndOverride: () => ({ entities: ["templates"] }) as InvalidateCacheOptions,
  } as unknown as Reflector;

  const interceptor = new CacheInvalidationInterceptor(reflector, invalidator);

  const tplKey = CacheKeys.template("tpl-error");
  await cache.set(tplKey, { title: "Preserved" });

  const context = createMockExecutionContext("POST", "/api/templates", {}, { title: "" });
  const next: CallHandler = {
    handle: () => throwError(() => new Error("Validation failed (400 Bad Request)")),
  };

  await assert.rejects(
    () => firstValueFrom(interceptor.intercept(context, next)),
    /Validation failed/,
  );

  // Warm cache entry remains intact because operation failed
  assert.ok(await cache.has(tplKey));
});

function cacheClientSafe(client: InMemoryCacheClient): InMemoryCacheClient {
  return client;
}
