import { test } from "node:test";
import { strict as assert } from "node:assert";
import { AnalyticsService } from "../src/modules/analytics/analytics.service";

const access = { userId: "reviewer-1", role: "interviewer" as const, organizationId: "org-1" };

test("analytics summary uses organization-scoped persisted sessions and reports", async () => {
  const calls: Array<{ method: string; args: unknown }> = [];
  const prisma = {
    interviewSession: {
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
    evaluation: { findMany: async () => [] },
  };
  const service = new AnalyticsService(prisma as never);

  const summary = await service.summary(access);

  assert.equal(summary.totalCandidates, 2);
  assert.equal(summary.totalTemplates, 3);
  assert.equal(summary.completedAssessments, 1);
  assert.equal(summary.inProgressAssessments, 1);
  assert.equal(summary.completionRate, 0.5);
  assert.equal(summary.averageScore, 4.2);
  assert.equal(summary.totalSessions, 2);
  assert.ok(calls.some((call) => call.method === "session.groupBy"));
  assert.ok(calls.some((call) => call.method === "report.aggregate"));
  const scoped = calls.find((call) => call.method === "session.groupBy");
  assert.deepEqual((scoped?.args as { where: unknown }).where, { organizationId: "org-1" });
});
