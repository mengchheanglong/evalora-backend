import { test } from "node:test";
import { strict as assert } from "node:assert";
import { AnalyticsController } from "../src/modules/analytics/analytics.controller";
import { AnalyticsService } from "../src/modules/analytics/analytics.service";

const access = { userId: "reviewer-1", role: "interviewer" as const, organizationId: "org-1" };

test("comparable analytics reject missing, blank, and repeated template ids", () => {
  const service = {
    modulePerformance: () => { throw new Error("service should not be called"); },
  };
  // The health service is never reached: the guard clause rejects before any service call.
  const controller = new AnalyticsController(service as never, {} as never);
  const request = {
    user: { id: "reviewer-1", role: "interviewer", organizationId: "org-1" },
  } as never;

  for (const templateId of [undefined, " ", ["template-1", "template-2"]]) {
    assert.throws(
      () => controller.modulePerformance(request, templateId),
      /templateId is required for comparable analytics/,
    );
  }
});

test("analytics summary uses organization-scoped persisted sessions and reports", async () => {
  const calls: Array<{ method: string; args: unknown }> = [];
  const prisma = {
    interviewSession: {
      updateMany: async (args: unknown) => {
        calls.push({ method: "session.updateMany", args });
        return { count: 0 };
      },
      groupBy: async (args: unknown) => {
        calls.push({ method: "session.groupBy", args });
        return [
          { status: "COMPLETED", _count: { _all: 1 } },
          { status: "IN_PROGRESS", _count: { _all: 1 } },
        ];
      },
      findMany: async (args: any) => {
        calls.push({ method: "session.findMany", args });
        if (args?.distinct) {
          return [{ candidateId: "c1" }, { candidateId: "c2" }];
        }
        return [
          {
            id: "s1",
            completedAt: new Date(),
            candidate: { name: "A", email: "a@example.com" },
            template: { title: "T", roleType: "Engineer" },
            report: { overallScore: 4.2 },
          },
        ];
      },
    },
    assessmentTemplate: {
      count: async (args: unknown) => {
        calls.push({ method: "template.count", args });
        return 3;
      },
    },
    candidateReport: {
      aggregate: async (args: unknown) => {
        calls.push({ method: "report.aggregate", args });
        return { _avg: { overallScore: 4.2 }, _count: { _all: 1 } };
      },
      findMany: async () => [{ overallScore: 4.2 }],
    },
    evaluation: { groupBy: async () => [] },
    assessmentModule: { findMany: async () => [] },
  };
  const service = new AnalyticsService(prisma as never);

  const summary = await service.summary(access);

  assert.equal(summary.totalCandidates, 2);
  assert.equal(summary.totalTemplates, 3);
  assert.equal(summary.completedAssessments, 1);
  assert.equal(summary.inProgressAssessments, 1);
  assert.equal("completionRate" in summary, false);
  assert.equal(summary.closedCompletionRate, 1);
  assert.equal(summary.reportReadyAssessments, 1);
  assert.equal(summary.reportsPending, 0);
  assert.equal(summary.reportCoverageRate, 1);
  assert.equal(summary.activeAssessments, 1);
  assert.equal("averageScore" in summary, false);
  assert.equal(summary.totalSessions, 2);
  assert.equal(summary.scope, "organization");
  assert.equal(summary.dataWindow, "all_time");
  assert.ok(!Number.isNaN(Date.parse(summary.asOf)));
  assert.ok(calls.some((call) => call.method === "session.groupBy"));
  const reconciliation = calls.find((call) => call.method === "session.updateMany");
  assert.deepEqual((reconciliation?.args as { where: any }).where.organizationId, "org-1");
  assert.deepEqual((reconciliation?.args as { where: any }).where.status, { in: ["NOT_STARTED", "IN_PROGRESS"] });
  assert.ok(calls.some((call) => call.method === "report.aggregate"));
  const scoped = calls.find((call) => call.method === "session.groupBy");
  assert.deepEqual((scoped?.args as { where: unknown }).where, { organizationId: "org-1" });
});

test("analytics summary represents missing denominator rates as null", async () => {
  const prisma = {
    interviewSession: {
      groupBy: async () => [],
      findMany: async () => [],
    },
    assessmentTemplate: { count: async () => 0 },
    candidateReport: {
      aggregate: async () => ({ _avg: { overallScore: null }, _count: { _all: 0 } }),
    },
    evaluation: { groupBy: async () => [] },
    assessmentModule: { findMany: async () => [] },
  };
  const service = new AnalyticsService(prisma as never);

  const summary = await service.summary(access);

  assert.equal(summary.totalSessions, 0);
  assert.equal("averageScore" in summary, false);
  assert.equal("completionRate" in summary, false);
  assert.equal(summary.closedCompletionRate, null);
  assert.equal(summary.reportCoverageRate, null);
});

test("ready reports are ordered by report recency within the authorized scope", async () => {
  let capturedArgs: any;
  const updatedAt = new Date("2026-07-20T08:00:00.000Z");
  const prisma = {
    candidateReport: {
      findMany: async (args: any) => {
        capturedArgs = args;
        return [{
          id: "report-1",
          updatedAt,
          session: {
            id: "session-1",
            candidate: { name: "Dara Candidate" },
            template: { title: "Backend Engineer Assessment" },
          },
        }];
      },
    },
  };
  const service = new AnalyticsService(prisma as never);

  const ready = await service.readyReports(access);

  assert.deepEqual(capturedArgs.where, { session: { organizationId: "org-1", status: "COMPLETED" } });
  assert.deepEqual(capturedArgs.orderBy, { updatedAt: "desc" });
  assert.equal(capturedArgs.take, 6);
  assert.deepEqual(ready, [{
    id: "report-1",
    sessionId: "session-1",
    type: "report_ready",
    message: "Dara Candidate's report is ready for Backend Engineer Assessment",
    candidateName: "Dara Candidate",
    assessmentName: "Backend Engineer Assessment",
    status: "completed",
    createdAt: updatedAt.toISOString(),
  }]);
});

test("analytics reads reconcile timed-out in-progress sessions", async () => {
  const updates: any[] = [];
  let findCalls = 0;
  const prisma = {
    interviewSession: {
      updateMany: async (args: any) => {
        updates.push(args);
        return { count: 1 };
      },
      findMany: async () => {
        findCalls += 1;
        if (findCalls === 1) {
          return [{
            id: "timed-session",
            startedAt: new Date(Date.now() - 61 * 60_000),
            template: { timeLimitMin: 60 },
          }];
        }
        return [];
      },
    },
  };
  const service = new AnalyticsService(prisma as never);

  await service.activity(access);

  assert.equal(updates.length, 2);
  assert.deepEqual(updates[1].where.id, { in: ["timed-session"] });
  assert.equal(updates[1].where.organizationId, "org-1");
  assert.equal(updates[1].where.status, "IN_PROGRESS");
});

test("analytics trend averages report scores per day as a percentage, scoped to the org", async () => {
  let capturedWhere: unknown;
  const prisma = {
    candidateReport: {
      findMany: async (args: any) => {
        capturedWhere = args.where;
        return [
          { overallScore: 4, createdAt: new Date("2026-07-15T10:00:00Z"), session: { completedAt: new Date("2026-07-15T12:00:00Z") } },
          { overallScore: 5, createdAt: new Date("2026-07-15T11:00:00Z"), session: { completedAt: new Date("2026-07-15T13:00:00Z") } },
          { overallScore: 3, createdAt: new Date("2026-07-16T09:00:00Z"), session: { completedAt: null } },
        ];
      },
    },
  };
  const service = new AnalyticsService(prisma as never);

  const trend = await service.trend(access);

  assert.deepEqual(trend, [
    { date: "2026-07-15", score: 90, completedCount: 2 },
    { date: "2026-07-16", score: 60, completedCount: 1 },
  ]);
  assert.equal((capturedWhere as any).session.organizationId, "org-1");
  assert.equal((capturedWhere as any).session.status, "COMPLETED");
  assert.ok((capturedWhere as any).session.completedAt.gte instanceof Date);
});

test("analytics module performance combines modules by type within one template", async () => {
  let capturedWhere: unknown;
  const prisma = {
    evaluation: {
      groupBy: async (args: any) => {
        capturedWhere = args.where;
        return [
          { moduleId: "module-a", _avg: { score: 4 }, _count: { _all: 1 } },
          { moduleId: "module-b", _avg: { score: 2 }, _count: { _all: 1 } },
          { moduleId: "module-c", _avg: { score: 5 }, _count: { _all: 1 } },
        ];
      },
    },
    assessmentModule: {
      findMany: async () => [
        { id: "module-a", moduleType: "CODING" },
        { id: "module-b", moduleType: "CODING" },
        { id: "module-c", moduleType: "LEADERSHIP" },
      ],
    },
  };
  const service = new AnalyticsService(prisma as never);

  const result = await service.modulePerformance(access, "template-1");

  assert.deepEqual(result, [
    { moduleType: "leadership", title: "Leadership", average: 5, evaluationCount: 1 },
    { moduleType: "coding", title: "Coding", average: 3, evaluationCount: 2 },
  ]);
  assert.deepEqual(capturedWhere, {
    session: { organizationId: "org-1", status: "COMPLETED", templateId: "template-1" },
  });
});

test("score distribution separates no evidence and filters to one template", async () => {
  let capturedWhere: unknown;
  const prisma = {
    candidateReport: {
      groupBy: async (args: any) => {
        capturedWhere = args.where;
        return [
        { overallScore: 0, _count: { _all: 1 } },
        { overallScore: 0.8, _count: { _all: 1 } },
        { overallScore: 4.5, _count: { _all: 1 } },
        ];
      },
    },
  };
  const service = new AnalyticsService(prisma as never);

  assert.deepEqual(await service.scoreDistribution(access, "template-1"), [
    { label: "No assessable evidence", count: 1, noEvidence: true },
    { label: ">0-0.9", count: 1, noEvidence: false },
    { label: "1.0-1.9", count: 0 },
    { label: "2.0-2.9", count: 0 },
    { label: "3.0-3.9", count: 0 },
    { label: "4.0-5.0", count: 1 },
  ]);
  assert.deepEqual(capturedWhere, {
    session: { organizationId: "org-1", status: "COMPLETED", templateId: "template-1" },
  });
});

test("completion duration returns a median and distribution for one template", async () => {
  let capturedWhere: unknown;
  const prisma = {
    interviewSession: {
      findMany: async (args: any) => {
        capturedWhere = args.where;
        return [
          { startedAt: new Date("2026-07-01T10:00:00Z"), completedAt: new Date("2026-07-01T11:00:00Z") },
          { startedAt: new Date("2026-07-02T10:00:00Z"), completedAt: new Date("2026-07-02T11:30:00Z") },
          { startedAt: new Date("2026-07-03T12:00:00Z"), completedAt: new Date("2026-07-03T11:00:00Z") },
        ];
      },
    },
  };
  const service = new AnalyticsService(prisma as never);

  assert.deepEqual(await service.completionDuration(access, "template-1"), {
    templateId: "template-1",
    medianMinutes: 75,
    sampleSize: 2,
    buckets: [
      { label: "Under 30 min", count: 0 },
      { label: "30-59 min", count: 0 },
      { label: "60-89 min", count: 1 },
      { label: "90+ min", count: 1 },
    ],
  });
  assert.deepEqual(capturedWhere, {
    organizationId: "org-1",
    status: "COMPLETED",
    templateId: "template-1",
    startedAt: { not: null },
    completedAt: { not: null },
  });
});

test("template usage ranks authorized assignments and completed outcomes", async () => {
  let capturedWhere: unknown;
  const prisma = {
    interviewSession: {
      groupBy: async (args: any) => {
        capturedWhere = args.where;
        return [
          { templateId: "template-1", status: "COMPLETED", _count: { _all: 3 } },
          { templateId: "template-1", status: "IN_PROGRESS", _count: { _all: 1 } },
          { templateId: "template-2", status: "EXPIRED", _count: { _all: 2 } },
        ];
      },
    },
    assessmentTemplate: {
      findMany: async () => [
        { id: "template-1", title: "Software Engineer Assessment" },
        { id: "template-2", title: "Team Leader Assessment" },
      ],
    },
  };
  const service = new AnalyticsService(prisma as never);

  assert.deepEqual(await service.templateUsage(access), [
    { templateId: "template-1", title: "Software Engineer Assessment", assignments: 4, completed: 3 },
    { templateId: "template-2", title: "Team Leader Assessment", assignments: 2, completed: 0 },
  ]);
  assert.deepEqual(capturedWhere, { organizationId: "org-1" });
});
