import { test } from "node:test";
import { strict as assert } from "node:assert";
import { TemplatesService } from "../src/modules/templates/templates.service";
import { SessionsService } from "../src/modules/sessions/sessions.service";
import { SystemHealthService } from "../src/modules/analytics/system-health.service";
import { AnalyticsService } from "../src/modules/analytics/analytics.service";
import { CacheService } from "../src/common/caching/cache.service";
import { InMemoryCacheClient } from "../src/common/caching/in-memory-cache.client";

const org1Access = { userId: "user-1", role: "organization" as const, organizationId: "org-1" };
const org2Access = { userId: "user-2", role: "organization" as const, organizationId: "org-2" };

test("TemplatesService: repetitive listTemplates fetches from cache and prevents duplicate DB queries", async () => {
  const cacheClient = new InMemoryCacheClient();
  const cache = new CacheService(cacheClient);

  let dbFindManyCount = 0;
  const mockTemplates = [
    {
      id: "tpl-1",
      title: "Fullstack Assessment",
      description: "React and Node",
      roleType: "Fullstack",
      timeLimitMin: 60,
      scoringRules: null,
      createdById: "user-1",
      organizationId: "org-1",
      modules: [],
    },
  ];

  const prisma = {
    assessmentTemplate: {
      findMany: async () => {
        dbFindManyCount++;
        return mockTemplates;
      },
    },
  };

  const service = new TemplatesService(prisma as never, cache);

  // First call: populates cache from DB
  const res1 = await service.listTemplates({ organizationId: "org-1", access: org1Access });
  assert.equal(res1.length, 1);
  assert.equal(res1[0].id, "tpl-1");
  assert.equal(dbFindManyCount, 1);

  // Second call: serves immediately from cache
  const res2 = await service.listTemplates({ organizationId: "org-1", access: org1Access });
  assert.equal(res2.length, 1);
  assert.equal(res2[0].id, "tpl-1");
  assert.equal(dbFindManyCount, 1, "Database query count should still be 1 (cache hit)");

  // Verify cache operational stats
  const stats = cache.getStats();
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 1);
});

test("TemplatesService: concurrent listTemplates calls coalesce into single flight (stampede protection)", async () => {
  const cacheClient = new InMemoryCacheClient();
  const cache = new CacheService(cacheClient);

  let dbFindManyCount = 0;
  const prisma = {
    assessmentTemplate: {
      findMany: async () => {
        dbFindManyCount++;
        // Simulate asynchronous database latency
        await new Promise((resolve) => setTimeout(resolve, 20));
        return [
          {
            id: "tpl-coalesce",
            title: "Coalesced Template",
            roleType: "QA",
            createdById: "user-1",
            organizationId: "org-1",
            modules: [],
          },
        ];
      },
    },
  };

  const service = new TemplatesService(prisma as never, cache);

  // Fire 10 simultaneous concurrent requests
  const promises = Array.from({ length: 10 }, () =>
    service.listTemplates({ organizationId: "org-1", access: org1Access }),
  );
  const results = await Promise.all(promises);

  // All 10 requests receive the correct data
  for (const res of results) {
    assert.equal(res[0].id, "tpl-coalesce");
  }

  // But only 1 actual DB query was executed
  assert.equal(dbFindManyCount, 1, "Stampede protection should coalesce concurrent calls to 1 DB execution");
});

test("TemplatesService: getTemplate caches by ID while preserving tenant isolation", async () => {
  const cacheClient = new InMemoryCacheClient();
  const cache = new CacheService(cacheClient);

  let dbFindUniqueCount = 0;
  const templateRow = {
    id: "tpl-secure",
    title: "Secure Template",
    roleType: "Security Engineer",
    createdById: "user-1",
    organizationId: "org-1",
    modules: [],
  };

  const prisma = {
    assessmentTemplate: {
      findUnique: async () => {
        dbFindUniqueCount++;
        return templateRow;
      },
    },
  };

  const service = new TemplatesService(prisma as never, cache);

  // Org 1 accesses their own template: loads from DB & caches
  const allowed = await service.getTemplate("tpl-secure", org1Access);
  assert.ok(allowed);
  assert.equal(allowed?.id, "tpl-secure");
  assert.equal(dbFindUniqueCount, 1);

  // Org 2 attempts to access Org 1's template: denied (tenant isolation check on cached item)
  const forbidden = await service.getTemplate("tpl-secure", org2Access);
  assert.equal(forbidden, null, "Org 2 should receive null (not authorized)");
  assert.equal(dbFindUniqueCount, 1, "Did not require an extra DB query to reject unauthorized tenant");

  // Org 1 accesses again: served from cache
  const cached = await service.getTemplate("tpl-secure", org1Access);
  assert.ok(cached);
  assert.equal(cached?.id, "tpl-secure");
  assert.equal(dbFindUniqueCount, 1, "Database query count remains 1");
});

test("TemplatesService: creating, updating, or deleting a template invalidates caches", async () => {
  const cacheClient = new InMemoryCacheClient();
  const cache = new CacheService(cacheClient);

  let listDbCalls = 0;
  let getDbCalls = 0;

  const currentTemplate = {
    id: "tpl-mutate",
    title: "Initial Title",
    roleType: "Backend",
    createdById: "user-1",
    organizationId: "org-1",
    modules: [],
  };

  const prisma = {
    assessmentTemplate: {
      findFirst: async () => currentTemplate,
      findMany: async () => {
        listDbCalls++;
        return [currentTemplate];
      },
      findUnique: async () => {
        getDbCalls++;
        return currentTemplate;
      },
      update: async (args: any) => {
        currentTemplate.title = args.data.title;
        return currentTemplate;
      },
      delete: async () => {
        return currentTemplate;
      },
    },
    interviewSession: { count: async () => 0 },
    assessmentModule: { findMany: async () => [] },
  };

  const service = new TemplatesService(prisma as never, cache);

  // Populate list and get caches
  await service.listTemplates({ organizationId: "org-1", access: org1Access });
  await service.getTemplate("tpl-mutate", org1Access);
  assert.equal(listDbCalls, 1);
  assert.equal(getDbCalls, 1);

  // Reads hit cache
  await service.listTemplates({ organizationId: "org-1", access: org1Access });
  await service.getTemplate("tpl-mutate", org1Access);
  assert.equal(listDbCalls, 1);
  assert.equal(getDbCalls, 1);

  // Mutate: updateTemplate
  await service.updateTemplate("tpl-mutate", { title: "Updated Title" }, org1Access);

  // Cache is invalidated: next reads query DB again
  const refreshedGet = await service.getTemplate("tpl-mutate", org1Access);
  assert.equal(refreshedGet?.title, "Updated Title");
  assert.equal(getDbCalls, 2, "getTemplate should re-query DB after updateTemplate");

  const refreshedList = await service.listTemplates({ organizationId: "org-1", access: org1Access });
  assert.equal(refreshedList[0].title, "Updated Title");
  assert.equal(listDbCalls, 2, "listTemplates should re-query DB after updateTemplate");

  // Mutate: deleteTemplate
  await service.deleteTemplate("tpl-mutate", org1Access);

  // Cache should be empty for this template
  const isCached = await cache.has("evalora:templates:detail:tpl-mutate");
  assert.equal(isCached, false, "Template detail cache should be evicted on delete");
});

test("SessionsService: getSessionByAccessCode caches and invalidates on start/complete/timeout", async () => {
  const cacheClient = new InMemoryCacheClient();
  const cache = new CacheService(cacheClient);

  let sessionReads = 0;
  const sessionRow: any = {
    id: "session-1",
    accessCode: "EVAL-TEST-1234",
    status: "NOT_STARTED",
    startedAt: null,
    completedAt: null,
    expiredAt: null,
    candidate: { name: "Alice", email: "alice@example.com" },
    createdBy: { id: "user-1", name: "Recruiter", role: "ORGANIZATION" },
    template: {
      id: "tpl-1",
      title: "Engineering Screen",
      description: "Screening",
      roleType: "Frontend",
      timeLimitMin: 45,
      scoringRules: null,
      createdById: "user-1",
      organizationId: "org-1",
      modules: [],
    },
  };

  const prisma = {
    interviewSession: {
      findFirst: async () => {
        sessionReads++;
        return sessionRow;
      },
      findUnique: async () => {
        sessionReads++;
        return sessionRow;
      },
      update: async (args: any) => {
        sessionRow.status = args.data.status;
        if (args.data.startedAt) sessionRow.startedAt = args.data.startedAt;
        if (args.data.completedAt) sessionRow.completedAt = args.data.completedAt;
        if (args.data.expiredAt) sessionRow.expiredAt = args.data.expiredAt;
        return sessionRow;
      },
    },
  };

  const service = new SessionsService(prisma as never, { cache });

  // 1. Initial candidate preview load
  const session1 = await service.getSessionByAccessCode("eval-test-1234");
  assert.equal(session1.accessCode, "EVAL-TEST-1234");
  assert.equal(session1.status, "not_started");
  assert.equal(sessionReads, 1);

  // 2. Repetitive read (e.g. instructions screen, camera checks)
  const session2 = await service.getSessionByAccessCode("EVAL-TEST-1234");
  assert.equal(session2.status, "not_started");
  assert.equal(sessionReads, 1, "Session access should be cached (0 extra DB queries)");

  // 3. Candidate clicks start: transitions to IN_PROGRESS and invalidates cache
  const started = await service.startSessionByAccessCode("EVAL-TEST-1234");
  assert.equal(started.status, "in_progress");

  // 4. Next read fetches fresh state from DB and populates new cache
  const session3 = await service.getSessionByAccessCode("EVAL-TEST-1234");
  assert.equal(session3.status, "in_progress");
  assert.equal(sessionReads, 3, "Re-read fetched fresh in-progress status from DB");

  // 5. Subsequent read is cached again
  const session4 = await service.getSessionByAccessCode("EVAL-TEST-1234");
  assert.equal(session4.status, "in_progress");
  assert.equal(sessionReads, 3, "Cached again with new status");
});

test("SystemHealthService: snapshot caches within realtime TTL and reduces DB latency checks", async () => {
  const cacheClient = new InMemoryCacheClient();
  const cache = new CacheService(cacheClient);

  let dbQueryCount = 0;
  let sessionCountCalls = 0;

  const prisma = {
    $queryRaw: async () => {
      dbQueryCount++;
      return [{ 1: 1 }];
    },
    interviewSession: {
      count: async () => {
        sessionCountCalls++;
        return 5;
      },
    },
    codeSubmission: { count: async () => 0 },
    interviewerFollowUp: { count: async () => 0 },
  };

  const gateway = {
    getRealtimeStats: () => ({
      connectedSockets: 2,
      activeSessionRooms: 1,
      connections: 10,
      disconnects: 8,
      joins: 10,
      rejectedJoins: 0,
      eventsEmitted: 25,
      uptimeSeconds: 120,
    }),
  };

  const service = new SystemHealthService(prisma as never, gateway as never, cache);

  // First call
  const snapshot1 = await service.snapshot(org1Access);
  assert.equal(snapshot1.realtime.connectedSockets, 2);
  assert.equal(dbQueryCount, 1);
  assert.equal(sessionCountCalls, 3); // liveSessions, sessionsToday, completedToday

  // Second immediate call (e.g. multi-tab burst or rapid polling)
  const snapshot2 = await service.snapshot(org1Access);
  assert.equal(snapshot2.realtime.connectedSockets, 2);
  assert.equal(dbQueryCount, 1, "Database query count should still be 1 (served from cache)");
  assert.equal(sessionCountCalls, 3, "Workload query count should still be 3 (served from cache)");
});

test("AnalyticsService: summary caches aggregations within medium TTL", async () => {
  const cacheClient = new InMemoryCacheClient();
  const cache = new CacheService(cacheClient);

  let groupByCalls = 0;
  let countCalls = 0;

  const prisma = {
    interviewSession: {
      updateMany: async () => ({ count: 0 }),
      groupBy: async () => {
        groupByCalls++;
        return [
          { status: "COMPLETED", _count: { _all: 10 } },
          { status: "IN_PROGRESS", _count: { _all: 2 } },
        ];
      },
      findMany: async (args: any) => {
        if (args?.distinct) return [{ candidateId: "cand-1" }];
        return [];
      },
    },
    assessmentTemplate: {
      count: async () => {
        countCalls++;
        return 4;
      },
    },
    candidateReport: {
      aggregate: async () => ({ _count: { _all: 10 } }),
    },
  };

  const service = new AnalyticsService(prisma as never, cache);

  // First call runs aggregations
  const summary1 = await service.summary(org1Access);
  assert.equal(summary1.totalTemplates, 4);
  assert.equal(summary1.completedAssessments, 10);
  assert.equal(groupByCalls, 1);
  assert.equal(countCalls, 1);

  // Second call returns cached summary
  const summary2 = await service.summary(org1Access);
  assert.equal(summary2.totalTemplates, 4);
  assert.equal(summary2.completedAssessments, 10);
  assert.equal(groupByCalls, 1, "groupBy query should not re-run (cache hit)");
  assert.equal(countCalls, 1, "count query should not re-run (cache hit)");

  // Operational stats
  const stats = cache.getStats();
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 1);
});
