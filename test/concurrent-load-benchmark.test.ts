import { test } from "node:test";
import { strict as assert } from "node:assert";
import { CacheService } from "../src/common/caching/cache.service";
import { InMemoryCacheClient } from "../src/common/caching/in-memory-cache.client";
import { TemplatesService } from "../src/modules/templates/templates.service";
import { SessionsService } from "../src/modules/sessions/sessions.service";
import { SlidingWindowRateLimitStore } from "../src/common/rate-limiting";

interface BenchmarkMetrics {
  totalRequests: number;
  durationMs: number;
  rps: number;
  minMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

function calculatePercentiles(latencies: number[], totalDurationMs: number): BenchmarkMetrics {
  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((acc, val) => acc + val, 0);
  const count = latencies.length;

  const p50Index = Math.floor(count * 0.5);
  const p95Index = Math.floor(count * 0.95);
  const p99Index = Math.min(Math.floor(count * 0.99), count - 1);

  return {
    totalRequests: count,
    durationMs: totalDurationMs,
    rps: Math.round((count / (totalDurationMs / 1000)) * 100) / 100,
    minMs: Math.round(latencies[0] * 100) / 100,
    avgMs: Math.round((sum / count) * 100) / 100,
    p50Ms: Math.round(latencies[p50Index] * 100) / 100,
    p95Ms: Math.round(latencies[p95Index] * 100) / 100,
    p99Ms: Math.round(latencies[p99Index] * 100) / 100,
    maxMs: Math.round(latencies[count - 1] * 100) / 100,
  };
}

test("Benchmark: Concurrent read-through cache load test (100 parallel requests with stampede protection)", async () => {
  const cacheClient = new InMemoryCacheClient();
  const cache = new CacheService(cacheClient);

  let dbExecutionCount = 0;
  const mockTemplates = [
    {
      id: "tpl-benchmark-1",
      title: "Senior Cloud Architect",
      description: "Distributed Systems & Kubernetes",
      roleType: "Cloud",
      timeLimitMin: 90,
      scoringRules: null,
      createdById: "user-1",
      organizationId: "org-bench",
      modules: [],
    },
  ];

  const prisma = {
    assessmentTemplate: {
      findMany: async () => {
        dbExecutionCount++;
        // Simulate real database I/O latency (25ms)
        await new Promise((resolve) => setTimeout(resolve, 25));
        return mockTemplates;
      },
    },
  };

  const templatesService = new TemplatesService(prisma as never, cache);
  const access = { userId: "user-1", role: "organization" as const, organizationId: "org-bench" };

  const CONCURRENT_CLIENTS = 100;
  const latencies: number[] = [];
  const startTime = performance.now();

  // Fire 100 concurrent requests simultaneously to simulate a high-traffic spike
  const promises = Array.from({ length: CONCURRENT_CLIENTS }, async () => {
    const t0 = performance.now();
    const result = await templatesService.listTemplates({ organizationId: "org-bench", access });
    const t1 = performance.now();
    latencies.push(t1 - t0);
    return result;
  });

  const results = await Promise.all(promises);
  const totalDuration = performance.now() - startTime;

  // Single-flight stampede protection must coalesce all 100 requests into exactly 1 database query
  assert.equal(dbExecutionCount, 1, "Stampede protection must coalesce 100 concurrent requests into 1 DB query");
  assert.equal(results.length, 100);
  results.forEach((res) => {
    assert.equal(res.length, 1);
    assert.equal(res[0].id, "tpl-benchmark-1");
  });

  const metrics = calculatePercentiles(latencies, totalDuration);
  // Verify all requests completed swiftly
  assert(metrics.maxMs < 200, `Max latency ${metrics.maxMs}ms should be well under 200ms`);
  assert(metrics.avgMs < 100, `Avg latency ${metrics.avgMs}ms should be under 100ms`);
});

test("Benchmark: High-throughput in-memory cache read performance (1,000 requests)", async () => {
  const cacheClient = new InMemoryCacheClient();
  const cache = new CacheService(cacheClient);

  await cache.set("evalora:benchmark:key", { data: "cached payload", timestamp: Date.now() }, 60_000);

  const REQUEST_COUNT = 1000;
  const latencies: number[] = [];
  const start = performance.now();

  for (let i = 0; i < REQUEST_COUNT; i++) {
    const t0 = performance.now();
    const val = await cache.get("evalora:benchmark:key");
    const t1 = performance.now();
    latencies.push(t1 - t0);
    assert.notEqual(val, null);
  }

  const duration = performance.now() - start;
  const metrics = calculatePercentiles(latencies, duration);

  const stats = cache.getStats();
  assert.equal(stats.hits, REQUEST_COUNT);
  assert.equal(stats.misses, 0);

  // Sub-millisecond performance assertions
  assert(metrics.avgMs < 1.0, `Average latency (${metrics.avgMs}ms) should be sub-millisecond`);
  assert(metrics.p95Ms < 2.0, `p95 latency (${metrics.p95Ms}ms) should be under 2ms`);
});

test("Benchmark: Sliding window rate limiting under concurrent burst load (500 operations)", async () => {
  const store = new SlidingWindowRateLimitStore();
  const limit = 500;
  const windowMs = 60_000;

  const latencies: number[] = [];
  const start = performance.now();

  const promises = Array.from({ length: 500 }, async (_, index) => {
    const ip = `192.168.1.${(index % 50) + 1}`;
    const t0 = performance.now();
    const result = store.consume(ip, limit, windowMs);
    const t1 = performance.now();
    latencies.push(t1 - t0);
    return result;
  });

  const results = await Promise.all(promises);
  const totalDuration = performance.now() - start;

  assert.equal(results.length, 500);
  results.forEach((r) => assert.equal(r.allowed, true));

  const metrics = calculatePercentiles(latencies, totalDuration);
  assert(metrics.avgMs < 1.0, `Sliding window consume avg latency (${metrics.avgMs}ms) must be sub-millisecond`);
});
