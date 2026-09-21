import "reflect-metadata";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  InMemoryCacheClient,
  CacheService,
  CacheNamespace,
  buildCacheKey,
  sanitizeKeySegment,
  CacheKeys,
  CACHE_TTL,
  DOMAIN_CACHE_TTL,
  parseTtlSeconds,
  CACHE_ROOT_PREFIX,
} from "../src/common/caching";

test("Cache Key Conventions: buildCacheKey generates standardized, sanitized hierarchical keys", () => {
  // Standard namespace and segments
  const key1 = buildCacheKey(CacheNamespace.CATALOG, "templates");
  assert.equal(key1, "evalora:catalog:templates");

  // Sanitization: trims whitespace, internal colons, and spaces
  const key2 = buildCacheKey("TEMPLATES ", "  org:123  ", " engineering role ");
  assert.equal(key2, "evalora:templates:org-123:engineering-role");

  // Omitted or undefined segments
  const key3 = buildCacheKey(CacheNamespace.SYSTEM, undefined, "health", null, "");
  assert.equal(key3, "evalora:system:health");

  // Empty segments only
  const key4 = buildCacheKey("sessions");
  assert.equal(key4, "evalora:sessions");
});

test("Cache Key Conventions: CacheKeys helpers adhere to domain standards", () => {
  assert.equal(CacheKeys.catalogTemplates(), "evalora:catalog:templates");
  assert.equal(CacheKeys.catalogTemplate("tmpl-123"), "evalora:catalog:template:tmpl-123");
  assert.equal(CacheKeys.orgTemplates("org-99"), "evalora:templates:org:org-99");
  assert.equal(CacheKeys.template("tmpl-abc"), "evalora:templates:detail:tmpl-abc");
  assert.equal(CacheKeys.sessionAccess("CODE-XYZ"), "evalora:sessions:access:CODE-XYZ");
  assert.equal(CacheKeys.session("sess-456"), "evalora:sessions:detail:sess-456");
  assert.equal(CacheKeys.sessionResponses("sess-456"), "evalora:sessions:responses:sess-456");
  assert.equal(CacheKeys.user("usr-789"), "evalora:users:profile:usr-789");
  assert.equal(CacheKeys.organization("org-99"), "evalora:orgs:detail:org-99");
  assert.equal(CacheKeys.analyticsSummary("org-99"), "evalora:analytics:summary:org-99");
  assert.equal(CacheKeys.analyticsTemplate("org-99", "tmpl-1"), "evalora:analytics:template:org-99:tmpl-1");
  assert.equal(CacheKeys.systemHealth(), "evalora:system:health");
});

test("TTL Expiration Rules: parseTtlSeconds safely handles NaN, negatives, floats, and clamps bounds", () => {
  assert.equal(parseTtlSeconds(60), 60);
  assert.equal(parseTtlSeconds("120"), 120);
  assert.equal(parseTtlSeconds(undefined, 300), 300);
  assert.equal(parseTtlSeconds(null, 300), 300);
  assert.equal(parseTtlSeconds("invalid", 300), 300);
  assert.equal(parseTtlSeconds(-10, 300), 300);
  assert.equal(parseTtlSeconds(0, 300), 300);
  assert.equal(parseTtlSeconds(1.5, 300), 300);

  // Maximum clamp (7 days = 604,800 seconds)
  assert.equal(parseTtlSeconds(99_999_999), 7 * 24 * 3600);
});

test("TTL Expiration Rules: Domain TTL assignments adhere to lifetime hierarchies", () => {
  assert.ok(CACHE_TTL.REALTIME < CACHE_TTL.SHORT);
  assert.ok(CACHE_TTL.SHORT < CACHE_TTL.MEDIUM);
  assert.ok(CACHE_TTL.MEDIUM < CACHE_TTL.STANDARD);
  assert.ok(CACHE_TTL.STANDARD < CACHE_TTL.CATALOG);
  assert.ok(CACHE_TTL.CATALOG < CACHE_TTL.DAY);

  assert.equal(DOMAIN_CACHE_TTL.system, CACHE_TTL.REALTIME);
  assert.equal(DOMAIN_CACHE_TTL.sessions, CACHE_TTL.SHORT);
  assert.equal(DOMAIN_CACHE_TTL.analytics, CACHE_TTL.MEDIUM);
  assert.equal(DOMAIN_CACHE_TTL.templates, CACHE_TTL.STANDARD);
  assert.equal(DOMAIN_CACHE_TTL.catalog, CACHE_TTL.CATALOG);
});

test("InMemoryCacheClient: set, get, has, delete, and clear operations", async () => {
  const client = new InMemoryCacheClient({ defaultTtlSeconds: 10 });

  await client.set("key-1", { greeting: "hello" });
  assert.equal(await client.has("key-1"), true);

  const value = await client.get<{ greeting: string }>("key-1");
  assert.deepEqual(value, { greeting: "hello" });

  assert.equal(await client.has("non-existent"), false);
  assert.equal(await client.get("non-existent"), null);

  const deleted = await client.delete("key-1");
  assert.equal(deleted, true);
  assert.equal(await client.get("key-1"), null);

  await client.set("a", 1);
  await client.set("b", 2);
  assert.equal(await client.size(), 2);
  await client.clear();
  assert.equal(await client.size(), 0);
});

test("InMemoryCacheClient: deterministic TTL expiration (lazy and active sweep)", async () => {
  const client = new InMemoryCacheClient();

  // Insert item with 1 second TTL
  await client.set("expiring-key", "temporary data", 1);
  assert.equal(await client.get("expiring-key"), "temporary data");

  // Wait 1.1s for expiration
  await new Promise((resolve) => setTimeout(resolve, 1100));

  // Lazy expiration on get
  const afterExpiry = await client.get("expiring-key");
  assert.equal(afterExpiry, null);

  // Proactive active sweep
  await client.set("sweep-1", "val1", 1);
  await client.set("sweep-2", "val2", 1);
  await client.set("sweep-persistent", "val3", 60);

  await new Promise((resolve) => setTimeout(resolve, 1100));

  const sweptCount = client.sweep();
  assert.equal(sweptCount, 2);
  assert.equal(await client.get("sweep-persistent"), "val3");
});

test("InMemoryCacheClient: memory capacity bounding and LRU eviction under burst insertions", async () => {
  const maxEntries = 5;
  const client = new InMemoryCacheClient({ maxEntries, defaultTtlSeconds: 60 });

  // Fill cache to capacity (keys: k0, k1, k2, k3, k4)
  for (let i = 0; i < maxEntries; i++) {
    await client.set(`k${i}`, `value-${i}`);
  }
  assert.equal(await client.size(), 5);

  // Access k0 so k1 becomes the oldest unaccessed
  await client.get("k0");

  // Insert k5 (triggers eviction of k1)
  await client.set("k5", "value-5");

  assert.equal(await client.size(), 5, "Size must remain bounded at maxEntries");
  assert.equal(await client.get("k1"), null, "k1 should have been evicted");
  assert.equal(await client.get("k0"), "value-0", "k0 should be preserved due to recent access");
  assert.equal(await client.get("k5"), "value-5", "k5 should be present");
});

test("InMemoryCacheClient: prefix and pattern-based invalidation", async () => {
  const client = new InMemoryCacheClient({ defaultTtlSeconds: 60 });

  await client.set("evalora:orgs:org-1:templates", ["t1", "t2"]);
  await client.set("evalora:orgs:org-1:analytics", { score: 90 });
  await client.set("evalora:orgs:org-2:templates", ["t3"]);
  await client.set("evalora:catalog:templates", ["c1"]);

  // Invalidate all cache for org-1
  const removed = await client.deleteByPrefix("evalora:orgs:org-1:");
  assert.equal(removed, 2);

  assert.equal(await client.get("evalora:orgs:org-1:templates"), null);
  assert.equal(await client.get("evalora:orgs:org-1:analytics"), null);
  assert.deepEqual(await client.get("evalora:orgs:org-2:templates"), ["t3"]);
  assert.deepEqual(await client.get("evalora:catalog:templates"), ["c1"]);

  // Pattern deletion with wildcard
  const patternRemoved = await client.deleteByPattern("evalora:*:templates");
  assert.equal(patternRemoved, 2);
  assert.equal(await client.get("evalora:orgs:org-2:templates"), null);
  assert.equal(await client.get("evalora:catalog:templates"), null);
});

test("CacheService: single-flight stampede protection coalesces concurrent factory requests", async () => {
  const service = new CacheService();
  const key = "stampede-test-key";
  let factoryExecutions = 0;

  const expensiveComputation = async () => {
    factoryExecutions++;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { data: "expensive-result", timestamp: Date.now() };
  };

  // Launch 25 simultaneous getOrSet calls for the same cold key
  const promises = Array.from({ length: 25 }, () =>
    service.getOrSet(key, expensiveComputation, 30),
  );

  const results = await Promise.all(promises);

  assert.equal(factoryExecutions, 1, "Factory must only execute once despite 25 concurrent callers");
  for (const res of results) {
    assert.deepEqual(res, results[0]);
  }

  // Second round: immediate cache hit without executing factory
  const cachedHit = await service.getOrSet(key, expensiveComputation, 30);
  assert.equal(factoryExecutions, 1, "Cache hit must not execute factory");
  assert.deepEqual(cachedHit, results[0]);
});

test("CacheStats: accurate tracking of hits, misses, evictions, and hit ratio", async () => {
  const client = new InMemoryCacheClient({ maxEntries: 2, defaultTtlSeconds: 60 });

  client.resetStats();
  const initial = client.getStats();
  assert.equal(initial.hits, 0);
  assert.equal(initial.misses, 0);
  assert.equal(initial.hitRatio, 0);

  // 1 miss
  await client.get("missing");

  // 1 set
  await client.set("key1", "val1");

  // 1 hit
  await client.get("key1");

  const stats = client.getStats();
  assert.equal(stats.misses, 1);
  assert.equal(stats.hits, 1);
  assert.equal(stats.sets, 1);
  assert.equal(stats.hitRatio, 0.5); // 1 hit / 2 requests = 0.5
});
