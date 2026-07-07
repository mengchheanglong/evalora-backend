import { test } from "node:test";
import { strict as assert } from "node:assert";
import { ReportsService } from "../src/modules/reports/reports.service";
import { generateCandidateReport, type EvaluationResultDto } from "../src/modules/ai/evaluation.service";

const organizationAccess = { userId: "org-user-1", role: "organization" as const, organizationId: "org-1" };

function sampleEvaluation(overrides: Partial<EvaluationResultDto> = {}): EvaluationResultDto {
  return {
    moduleId: "module-ai",
    moduleTitle: "AI Interview",
    moduleType: "ai_interview",
    weight: 1,
    score: 4.2,
    criteriaScores: { clarity: 4.2 },
    feedback: "Clear evidence-backed answer.",
    strengths: ["Clear reasoning"],
    improvementAreas: ["Add metrics"],
    evidence: ["Explained trade-offs"],
    advisoryNotice: "AI feedback is advisory and must be reviewed by a human interviewer.",
    ...overrides,
  };
}

test("persistReport replaces evaluations and upserts candidate report for a session", async () => {
  const calls: Array<{ action: string; args: unknown }> = [];
  const fakePrisma = {
    evaluation: {
      deleteMany: async (args: unknown) => {
        calls.push({ action: "evaluation.deleteMany", args });
        return { count: 1 };
      },
      createMany: async (args: unknown) => {
        calls.push({ action: "evaluation.createMany", args });
        return { count: 2 };
      },
    },
    candidateReport: {
      upsert: async (args: unknown) => {
        calls.push({ action: "candidateReport.upsert", args });
        return { id: "report-1" };
      },
    },
    $transaction: async <T>(operations: Array<Promise<T>>) => Promise.all(operations),
  };

  const evaluations = [sampleEvaluation(), sampleEvaluation({ moduleId: undefined, moduleTitle: "Communication", moduleType: "communication", score: 3.8 })];
  const report = generateCandidateReport({
    sessionId: "session-1",
    candidateName: "Demo Candidate",
    assessmentName: "Software Engineer Assessment",
    evaluations,
    reviewerNotes: ["Human reviewer note"],
  });
  const service = new ReportsService(fakePrisma);

  const result = await service.persistReport({ report, evaluations });

  assert.deepEqual(result, { status: "persisted", evaluationCount: 2 });
  assert.deepEqual(calls.map((call) => call.action), ["evaluation.deleteMany", "evaluation.createMany", "candidateReport.upsert"]);
  assert.deepEqual(calls[0].args, { where: { sessionId: "session-1" } });

  const createManyArgs = calls[1].args as { data: Array<{ sessionId: string; moduleId: string | null; score: number; evidence: string[] }> };
  assert.equal(createManyArgs.data.length, 2);
  assert.equal(createManyArgs.data[0].sessionId, "session-1");
  assert.equal(createManyArgs.data[1].moduleId, null);
  assert.deepEqual(createManyArgs.data[0].evidence, ["Explained trade-offs"]);

  const upsertArgs = calls[2].args as { where: { sessionId: string }; create: { overallScore: number }; update: { reviewerSummary?: string } };
  assert.equal(upsertArgs.where.sessionId, "session-1");
  assert.equal(upsertArgs.create.overallScore, report.overallScore);
  assert.equal(upsertArgs.update.reviewerSummary, "Human reviewer note");
});

test("persistReport skips persistence when no Prisma client is available", async () => {
  const service = new ReportsService();
  const evaluations = [sampleEvaluation()];
  const report = generateCandidateReport({
    sessionId: "session-2",
    candidateName: "Demo Candidate",
    assessmentName: "Software Engineer Assessment",
    evaluations,
  });

  const result = await service.persistReport({ report, evaluations });

  assert.deepEqual(result, { status: "skipped", reason: "database client unavailable" });
});

test("getReport returns a persisted CandidateReport when one exists", async () => {
  const calls: Array<{ action: string; args: unknown }> = [];
  const completedAt = new Date("2026-07-07T10:00:00.000Z");
  const fakePrisma = {
    interviewSession: {
      findFirst: async (args: unknown) => {
        calls.push({ action: "interviewSession.findFirst", args });
        return { id: "session-1", organizationId: "org-1" };
      },
    },
    candidateReport: {
      findUnique: async (args: unknown) => {
        calls.push({ action: "candidateReport.findUnique", args });
        return {
          sessionId: "session-1",
          overallScore: 4.6,
          moduleScores: { "AI Interview": 4.7, "Coding Assessment": 4.5 },
          summary: "Persisted report summary.",
          strengths: ["Clear reasoning"],
          improvementAreas: ["Add more metrics"],
          evidence: ["Explained trade-offs"],
          reviewerSummary: "Human reviewer note.",
          session: {
            completedAt,
            candidate: { name: "Sophea Candidate" },
            template: { title: "Backend Engineer Assessment" },
          },
        };
      },
    },
  };
  const service = new ReportsService(fakePrisma as any);

  const report = await service.getReport("session-1", organizationAccess);

  assert.deepEqual(calls.map((call) => call.action), ["interviewSession.findFirst", "candidateReport.findUnique"]);
  assert.equal(report.sessionId, "session-1");
  assert.equal(report.candidateName, "Sophea Candidate");
  assert.equal(report.assessmentName, "Backend Engineer Assessment");
  assert.equal(report.completedAt, completedAt.toISOString());
  assert.equal(report.overallScore, 4.6);
  assert.deepEqual(report.moduleScores, { "AI Interview": 4.7, "Coding Assessment": 4.5 });
  assert.deepEqual(report.strengths, ["Clear reasoning"]);
  assert.equal(report.reviewerSummary, "Human reviewer note.");
  assert.match(report.advisoryNotice, /not a final hiring decision/i);
});

test("generateAndPersistDemoReport checks organization ownership before writing report data", async () => {
  const calls: Array<{ action: string; args: unknown }> = [];
  const fakePrisma = {
    interviewSession: {
      findFirst: async (args: unknown) => {
        calls.push({ action: "interviewSession.findFirst", args });
        return { id: "session-1", organizationId: "org-1" };
      },
    },
    evaluation: {
      deleteMany: async (args: unknown) => {
        calls.push({ action: "evaluation.deleteMany", args });
        return { count: 0 };
      },
      createMany: async (args: unknown) => {
        calls.push({ action: "evaluation.createMany", args });
        return { count: 3 };
      },
    },
    candidateReport: {
      upsert: async (args: unknown) => {
        calls.push({ action: "candidateReport.upsert", args });
        return { id: "report-1" };
      },
    },
    $transaction: async <T>(operations: Array<Promise<T>>) => Promise.all(operations),
  };
  const service = new ReportsService(fakePrisma as any);

  const result = await (service as any).generateAndPersistDemoReport("session-1", organizationAccess);

  assert.equal(result.persistence.status, "persisted");
  assert.deepEqual(calls[0], {
    action: "interviewSession.findFirst",
    args: { where: { id: "session-1", organizationId: "org-1" } },
  });
  assert.deepEqual(calls.map((call) => call.action), [
    "interviewSession.findFirst",
    "evaluation.deleteMany",
    "evaluation.createMany",
    "candidateReport.upsert",
  ]);
});

test("getReport rejects inaccessible report sessions", async () => {
  const fakePrisma = {
    interviewSession: {
      findFirst: async (args: unknown) => {
        assert.deepEqual(args, { where: { id: "session-1", organizationId: "org-1" } });
        return null;
      },
    },
  };
  const service = new ReportsService(fakePrisma as any);

  await assert.rejects(() => (service as any).getReport("session-1", organizationAccess), /not found or access denied/i);
});
