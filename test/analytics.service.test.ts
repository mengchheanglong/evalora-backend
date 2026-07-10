import { test } from "node:test";
import { strict as assert } from "node:assert";
import { AnalyticsService } from "../src/modules/analytics/analytics.service";

const access = { userId: "reviewer-1", role: "interviewer" as const, organizationId: "org-1" };

test("analytics summary uses organization-scoped persisted sessions and reports", async () => {
  const calls: Array<{ method: string; args: unknown }> = [];
  const prisma = {
    interviewSession: {
      findMany: async (args: unknown) => {
        calls.push({ method: "session.findMany", args });
        return [
          { id: "s1", candidateId: "c1", status: "COMPLETED", createdAt: new Date(), updatedAt: new Date(), completedAt: new Date(), candidate: { name: "A", email: "a@example.com" }, template: { title: "T", roleType: "Engineer" }, report: { overallScore: 4.2 } },
          { id: "s2", candidateId: "c2", status: "IN_PROGRESS", createdAt: new Date(), updatedAt: new Date(), completedAt: null, candidate: { name: "B", email: "b@example.com" }, template: { title: "T", roleType: "Engineer" }, report: null },
        ];
      },
    },
    assessmentTemplate: { count: async (args: unknown) => { calls.push({ method: "template.count", args }); return 3; } },
    candidateReport: { findMany: async (args: unknown) => { calls.push({ method: "report.findMany", args }); return [{ overallScore: 4.2 }]; } },
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
  assert.deepEqual((calls[0].args as { where: unknown }).where, { organizationId: "org-1" });
  assert.deepEqual((calls[1].args as { where: unknown }).where, { organizationId: "org-1" });
});
