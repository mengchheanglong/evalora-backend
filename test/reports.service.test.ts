import { test } from "node:test";
import { strict as assert } from "node:assert";
import { ReportsService } from "../src/modules/reports/reports.service";
import { evaluateResponse, generateCandidateReport, type EvaluationResultDto } from "../src/modules/ai/evaluation.service";

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

test("getReport hides stale strengths from a persisted zero-score report", async () => {
  const fakePrisma = {
    interviewSession: {
      findFirst: async () => ({ id: "session-zero", organizationId: "org-1" }),
    },
    candidateReport: {
      findUnique: async () => ({
        sessionId: "session-zero",
        overallScore: 0,
        moduleScores: { "Coding Assessment": 0 },
        summary: "No assessable work.",
        strengths: ["Communicates reasoning clearly"],
        improvementAreas: ["Submit a complete response"],
        evidence: [],
        session: {
          candidate: { name: "No Evidence" },
          template: { title: "Coding Assessment" },
        },
      }),
    },
  };
  const service = new ReportsService(fakePrisma as unknown as ConstructorParameters<typeof ReportsService>[0]);

  const report = await service.getReport("session-zero", organizationAccess);

  assert.equal(report.overallScore, 0);
  assert.deepEqual(report.strengths, []);
  assert.deepEqual(report.improvementAreas, ["Submit a complete response"]);
});

test("generateAndPersistReport evaluates saved responses by module and persists a real candidate report", async () => {
  const calls: Array<{ action: string; args: unknown }> = [];
  const aiInputs: unknown[] = [];
  const completedAt = new Date("2026-07-08T09:30:00.000Z");
  const fakePrisma = {
    interviewSession: {
      findFirst: async (args: unknown) => {
        calls.push({ action: "interviewSession.findFirst", args });
        return {
          id: "session-1",
          organizationId: "org-1",
          completedAt,
          candidate: { name: "Sophea Candidate" },
          template: { title: "Software Engineer Assessment" },
          responses: [
            {
              id: "response-1",
              responseText: "I would clarify requirements, test edge cases, and measure impact.",
              responseJson: { selectedOption: "structured" },
              question: {
                id: "question-1",
                questionText: "How do you approach an unclear engineering task?",
                rubric: ["clarity", "testing"],
                module: { id: "module-ai", title: "Technical AI Interview", moduleType: "AI_INTERVIEW", weight: 1.1 },
              },
            },
            {
              id: "response-2",
              responseText: "I would reproduce the bug, add regression tests, and prevent recurrence.",
              question: {
                id: "question-2",
                questionText: "How would you debug a flaky issue?",
                rubric: ["root-cause analysis", "validation"],
                module: { id: "module-debug", title: "Debugging and Testing Task", moduleType: "DEBUGGING", weight: 1.25 },
              },
            },
            {
              id: "response-3",
              responseText: "I would explain trade-offs and document the decision for the team.",
              question: {
                id: "question-3",
                questionText: "How do you communicate a technical trade-off?",
                rubric: ["clarity", "professionalism"],
                module: { id: "module-ai", title: "Technical AI Interview", moduleType: "AI_INTERVIEW", weight: 1.1 },
              },
            },
          ],
        };
      },
    },
    evaluation: {
      deleteMany: async (args: unknown) => {
        calls.push({ action: "evaluation.deleteMany", args });
        return { count: 0 };
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
  const fakeAi = {
    evaluateResponse: async (input: any) => {
      aiInputs.push(input);
      return sampleEvaluation({
        moduleId: input.moduleId,
        moduleTitle: input.moduleTitle,
        moduleType: input.moduleType,
        weight: input.weight,
        score: input.moduleType === "debugging" ? 3.8 : 4.4,
        criteriaScores: Object.fromEntries((input.rubric ?? []).map((criterion: string) => [criterion, input.moduleType === "debugging" ? 3.8 : 4.4])),
        feedback: `Evaluated ${input.moduleTitle} from saved responses.`,
        evidence: [input.responseText],
      });
    },
  };
  const service = new ReportsService(fakePrisma as any, fakeAi as any);

  const result = await service.generateAndPersistReport("session-1", organizationAccess);

  assert.equal(result.candidateName, "Sophea Candidate");
  assert.equal(result.assessmentName, "Software Engineer Assessment");
  assert.equal(result.completedAt, completedAt.toISOString());
  assert.equal(result.persistence.status, "persisted");
  assert.equal(result.persistence.evaluationCount, 2);
  assert.equal(aiInputs.length, 2);
  assert.deepEqual(
    aiInputs.map((input: any) => input.moduleId),
    ["module-ai", "module-debug"],
  );
  // Question wording travels in questionContext; responseText is the candidate's words only.
  assert.deepEqual((aiInputs[0] as any).questionContext, [
    "Question: How do you approach an unclear engineering task?",
    "Question: How do you communicate a technical trade-off?",
  ]);
  assert.match((aiInputs[0] as any).responseText, /I would clarify requirements, test edge cases, and measure impact\./);
  assert.match((aiInputs[0] as any).responseText, /I would explain trade-offs and document the decision for the team\./);
  assert.doesNotMatch((aiInputs[0] as any).responseText, /How do you approach an unclear engineering task/);
  assert.doesNotMatch((aiInputs[0] as any).responseText, /How do you communicate a technical trade-off/);
  assert.deepEqual((aiInputs[0] as any).rubric, ["clarity", "testing", "professionalism"]);
  assert.deepEqual(calls[0], {
    action: "interviewSession.findFirst",
    args: {
      relationLoadStrategy: "join",
      where: { id: "session-1", organizationId: "org-1" },
      include: {
        candidate: { select: { name: true } },
        template: {
          select: {
            title: true,
            modules: {
              select: { id: true, title: true, moduleType: true, weight: true },
            },
          },
        },
        responses: {
          include: {
            question: {
              include: {
                module: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        aiMessages: {
          select: {
            id: true,
            role: true,
            content: true,
            metadata: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        codeSubmissions: {
          select: {
            questionId: true,
            language: true,
            sourceCode: true,
            stdout: true,
            stderr: true,
            compileOutput: true,
            status: true,
            score: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        interviewerFollowUps: {
          where: { status: "ANSWERED" },
          select: {
            moduleId: true,
            parentQuestionId: true,
            questionText: true,
            answerText: true,
            sequence: true,
            askedBy: { select: { name: true } },
          },
          orderBy: { sequence: "asc" },
        },
      },
    },
  });
  assert.deepEqual(calls.map((call) => call.action), [
    "interviewSession.findFirst",
    "evaluation.deleteMany",
    "evaluation.createMany",
    "candidateReport.upsert",
  ]);
});

test("generateAndPersistReport folds adaptive AI-interview answers (no linked question) into the AI module", async () => {
  const calls: Array<{ action: string; args: unknown }> = [];
  const aiInputs: any[] = [];
  const completedAt = new Date("2026-07-09T09:30:00.000Z");
  const fakePrisma = {
    interviewSession: {
      findFirst: async () => ({
        id: "session-9",
        organizationId: "org-1",
        completedAt,
        candidate: { name: "Adaptive Candidate" },
        template: {
          title: "AI Interview Assessment",
          modules: [{ id: "module-ai", title: "AI Interview", moduleType: "AI_INTERVIEW", weight: 1.5 }],
        },
        // Only adaptive answers were saved — each has NO questionId (question === null)
        // and is tagged adaptive. Before the fix these were dropped entirely, so the
        // report had no evaluations and persistence was skipped.
        responses: [
          {
            id: "resp-a1",
            responseText: "AI interview — Tell me about a hard trade-off.\n\nResponse: I weighed latency vs cost and documented it.",
            responseJson: {
              adaptive: true,
              question: "Tell me about a hard trade-off.",
              aiFollowUp: {
                question: "What metric proved the trade-off worked?",
                answer: "P95 latency fell by 35 percent while monthly cost stayed flat.",
              },
            },
            question: null,
          },
          {
            id: "resp-a2",
            responseText: "AI interview — How did the team react?\n\nResponse: I aligned them with a short RFC and a demo.",
            responseJson: { adaptive: true, question: "How did the team react?" },
            question: null,
          },
        ],
      }),
    },
    evaluation: {
      deleteMany: async (args: unknown) => {
        calls.push({ action: "evaluation.deleteMany", args });
        return { count: 0 };
      },
      createMany: async (args: unknown) => {
        calls.push({ action: "evaluation.createMany", args });
        return { count: 1 };
      },
    },
    candidateReport: {
      upsert: async (args: unknown) => {
        calls.push({ action: "candidateReport.upsert", args });
        return { id: "report-9" };
      },
    },
    $transaction: async <T>(operations: Array<Promise<T>>) => Promise.all(operations),
  };
  const fakeAi = {
    evaluateResponse: async (input: any) => {
      aiInputs.push(input);
      return sampleEvaluation({
        moduleId: input.moduleId,
        moduleTitle: input.moduleTitle,
        moduleType: input.moduleType,
        weight: input.weight,
        score: 4.1,
        evidence: [input.responseText],
      });
    },
  };
  const service = new ReportsService(fakePrisma as any, fakeAi as any);

  const result = await service.generateAndPersistReport("session-9", organizationAccess);

  // The adaptive interview must produce exactly one AI-interview evaluation...
  assert.equal(aiInputs.length, 1);
  assert.equal(aiInputs[0].moduleId, "module-ai");
  assert.equal(aiInputs[0].moduleType, "ai_interview");
  assert.equal(aiInputs[0].weight, 1.5);
  // ...carrying BOTH adaptive answers as evidence, with the AI-generated questions
  // split back out into context so they are never scored as the candidate's words.
  assert.match(aiInputs[0].responseText, /I weighed latency vs cost and documented it\./);
  assert.match(aiInputs[0].responseText, /I aligned them with a short RFC and a demo\./);
  assert.match(aiInputs[0].responseText, /P95 latency fell by 35 percent/);
  assert.doesNotMatch(aiInputs[0].responseText, /hard trade-off/i);
  assert.doesNotMatch(aiInputs[0].responseText, /What metric proved/i);
  assert.doesNotMatch(aiInputs[0].responseText, /How did the team react/i);
  assert.deepEqual(aiInputs[0].questionContext, [
    "AI interview question: Tell me about a hard trade-off.",
    "AI follow-up question: What metric proved the trade-off worked?",
    "AI interview question: How did the team react?",
  ]);
  // ...and the report is actually persisted (previously skipped: "no candidate responses").
  assert.equal(result.persistence.status, "persisted");
  assert.equal(result.persistence.evaluationCount, 1);
});

test("report evaluation includes unanswered template modules at zero", async () => {
  const service = new ReportsService();
  const evaluations = await (service as any).evaluateSessionResponses({
    template: {
      title: "Complete Template",
      modules: [
        { id: "module-answered", title: "Answered", moduleType: "BEHAVIORAL", weight: 1 },
        { id: "module-missing", title: "Missing", moduleType: "COMMUNICATION", weight: 1 },
      ],
    },
    responses: [
      {
        responseText: "I clarify the situation with the team and explain the result.",
        question: {
          id: "question-1",
          questionText: "What did you do?",
          rubric: ["clarity"],
          module: { id: "module-answered", title: "Answered", moduleType: "BEHAVIORAL", weight: 1 },
        },
      },
    ],
    codeSubmissions: [],
  });

  assert.equal(evaluations.length, 2);
  assert.equal(evaluations.find((evaluation: EvaluationResultDto) => evaluation.moduleId === "module-missing")?.score, 0);
});

test("coding report keeps exact objective 0, 25, 50, 80, and 100 percent scores", async () => {
  const service = new ReportsService();
  for (const percent of [0, 25, 50, 80, 100]) {
    const [evaluation] = await (service as any).evaluateSessionResponses({
      template: {
        title: "Coding Template",
        modules: [{ id: "module-code", title: "Coding", moduleType: "CODING", weight: 1 }],
      },
      responses: [],
      codeSubmissions: [{
        questionId: "challenge-1",
        language: "javascript",
        sourceCode: "console.log('candidate submission')",
        status: percent === 100 ? "Accepted" : "Wrong Answer",
        score: percent,
      }],
    });

    assert.equal(evaluation.score, percent / 20);
    assert.equal(Math.round(evaluation.score * 20), percent);
  }
});

test("an answered interviewer follow-up becomes evidence in its parent module without adding weight", async () => {
  const aiInputs: any[] = [];
  const fakePrisma = {
    interviewSession: {
      findFirst: async () => ({
        id: "session-ifu",
        organizationId: "org-1",
        completedAt: new Date("2026-07-20T09:00:00.000Z"),
        candidate: { name: "Follow-up Candidate" },
        template: {
          title: "SE Assessment",
          modules: [{ id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1.5 }],
        },
        responses: [
          {
            id: "response-1",
            responseText: "I rolled back the release after error rates spiked.",
            question: {
              id: "question-1",
              questionText: "Describe a rollout that went wrong.",
              rubric: ["ownership"],
              module: { id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1.5 },
            },
          },
        ],
        interviewerFollowUps: [
          {
            moduleId: "module-1",
            parentQuestionId: "question-1",
            questionText: "What signal would make you stop the rollout?",
            answerText: "If p95 latency doubles I stop immediately.",
            askedBy: { name: "Dana Interviewer" },
          },
          // Resolves its module from the parent question when moduleId is absent.
          {
            parentQuestionId: "question-1",
            questionText: "Who did you tell first?",
            answerText: "The on-call engineer and the product owner.",
            askedBy: { name: "Dana Interviewer" },
          },
        ],
      }),
    },
    evaluation: { deleteMany: async () => ({ count: 0 }), createMany: async () => ({ count: 1 }) },
    candidateReport: { upsert: async () => ({ id: "report-ifu" }) },
    $transaction: async <T>(operations: Array<Promise<T>>) => Promise.all(operations),
  };
  const fakeAi = {
    evaluateResponse: async (input: any) => {
      aiInputs.push(input);
      return sampleEvaluation({ moduleId: input.moduleId, moduleTitle: input.moduleTitle, moduleType: input.moduleType, weight: input.weight });
    },
  };
  const service = new ReportsService(fakePrisma as any, fakeAi as any);

  await service.generateAndPersistReport("session-ifu", organizationAccess);

  assert.equal(aiInputs.length, 1, "the follow-up must not create a second weighted module");
  const behavioral = aiInputs[0];
  assert.equal(behavioral.moduleId, "module-1");
  assert.equal(behavioral.weight, 1.5, "module weight is unchanged by follow-ups");
  assert.match(behavioral.responseText, /I rolled back the release/, "original answer is still evidence");
  assert.match(behavioral.responseText, /p95 latency doubles/, "follow-up answer is added as evidence");
  assert.match(behavioral.responseText, /on-call engineer/, "follow-up without moduleId resolves via its parent question");
  assert.deepEqual(
    behavioral.questionContext,
    [
      "Question: Describe a rollout that went wrong.",
      "Interviewer follow-up by Dana Interviewer: What signal would make you stop the rollout?",
      "Interviewer follow-up by Dana Interviewer: Who did you tell first?",
    ],
    "interviewer wording is carried as context, structurally apart from the scored answer",
  );
  assert.doesNotMatch(behavioral.responseText, /What signal would make you stop the rollout/, "the interviewer's question is never part of the scored text");
  assert.doesNotMatch(behavioral.responseText, /Who did you tell first/);
});

test("a leading interviewer follow-up question cannot change the candidate's score", async () => {
  // Same candidate answers in both runs; only the interviewer's question wording differs.
  const buildSession = (followUpQuestion: string) => ({
    id: "session-leading",
    organizationId: "org-1",
    template: {
      title: "SE Assessment",
      modules: [{ id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 }],
    },
    responses: [
      {
        id: "response-1",
        responseText: "I rolled back the deployment and explained the failure to the team.",
        question: {
          id: "question-1",
          questionText: "Describe a rollout that went wrong.",
          rubric: ["ownership"],
          module: { id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 },
        },
      },
    ],
    interviewerFollowUps: [
      {
        moduleId: "module-1",
        parentQuestionId: "question-1",
        questionText: followUpQuestion,
        answerText: "I told the on-call engineer first and then we tested the fix.",
        askedBy: { name: "Dana Interviewer" },
      },
    ],
    codeSubmissions: [],
  });

  // No AI provider, so the deterministic rubric scorer runs and the comparison is exact.
  const service = new ReportsService();
  const [neutral] = await (service as any).evaluateSessionResponses(buildSession("And then what happened?"));
  const [leading] = await (service as any).evaluateSessionResponses(
    buildSession(
      "Would you say you took full ownership, measured the impact with a percent metric, tested the result on a consistent-hash ring, and explained the trade-off to the client team because the customer outcome mattered?",
    ),
  );

  assert.equal(
    leading.score,
    neutral.score,
    "a keyword-stuffed interviewer question must not inflate the candidate's score",
  );
  assert.deepEqual(leading.criteriaScores, neutral.criteriaScores);
  assert.deepEqual(leading.evidence, neutral.evidence);
  assert.ok(
    leading.evidence.every((quote: string) => !quote.includes("consistent-hash")),
    "an evidence quote must never be able to return interviewer question wording",
  );
});

test("an AI follow-up question embedded in the stored answer cannot change the candidate's score", async () => {
  // The candidate app appends the AI exchange to the parent answer's own column:
  //   <answer>\n\nAI follow-up: <model question>\nFollow-up response: <answer>
  // That column is what gets scored, so the model's question wording reaches the
  // scorer through a completely different path than the interviewer follow-up.
  const buildSession = (aiQuestion: string) => ({
    id: "session-embedded",
    organizationId: "org-1",
    template: {
      title: "SE Assessment",
      modules: [{ id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 }],
    },
    responses: [
      {
        id: "response-1",
        responseText:
          "I rolled back the deployment and explained the failure to the team."
          + `\n\nAI follow-up: ${aiQuestion}`
          + "\nFollow-up response: I told the on-call engineer first and then we tested the fix.",
        question: {
          id: "question-1",
          questionText: "Describe a rollout that went wrong.",
          rubric: ["ownership"],
          module: { id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 },
        },
      },
    ],
    interviewerFollowUps: [],
    codeSubmissions: [],
  });

  const service = new ReportsService();
  const [neutral] = await (service as any).evaluateSessionResponses(buildSession("And then what happened?"));
  const [leading] = await (service as any).evaluateSessionResponses(
    buildSession(
      "Would you say you took full ownership, measured the impact with a percent metric, tested the result on a consistent-hash ring, and explained the trade-off to the client team because the customer outcome mattered?",
    ),
  );

  assert.equal(
    leading.score,
    neutral.score,
    "a keyword-stuffed AI follow-up question must not inflate the candidate's score",
  );
  assert.deepEqual(leading.criteriaScores, neutral.criteriaScores);
  assert.deepEqual(leading.evidence, neutral.evidence);
  assert.ok(
    leading.evidence.every((quote: string) => !quote.includes("consistent-hash")),
    "an evidence quote must never be able to return AI-authored question wording",
  );
});

test("a structured AI follow-up answer is scored while its question remains context", async () => {
  const inputs: any[] = [];
  const service = new ReportsService(undefined, {
    evaluateResponse: async (input: any) => {
      inputs.push(input);
      return evaluateResponse(input);
    },
  } as any);

  await (service as any).evaluateSessionResponses({
    id: "session-structured-follow-up",
    organizationId: "org-1",
    template: {
      title: "SE Assessment",
      modules: [{ id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 }],
    },
    responses: [{
      id: "response-1",
      responseText: "I rolled back the deployment.",
      responseJson: {
        aiFollowUp: {
          question: "Would you say you showed ownership and measurable impact?",
          answer: "I notified the team, tested the fix, and reduced errors by 30 percent.",
        },
      },
      question: {
        id: "question-1",
        questionText: "Describe a rollout that went wrong.",
        rubric: ["ownership", "measurable impact"],
        module: { id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 },
      },
    }],
    aiMessages: [],
    interviewerFollowUps: [],
    codeSubmissions: [],
  });

  assert.match(inputs[0].responseText, /I rolled back the deployment/);
  assert.match(inputs[0].responseText, /reduced errors by 30 percent/);
  assert.doesNotMatch(inputs[0].responseText, /Would you say/);
  assert.deepEqual(inputs[0].questionContext, [
    "Question: Describe a rollout that went wrong.\nAI follow-up: Would you say you showed ownership and measurable impact?",
  ]);
});

test("reports recover an answer-only follow-up written before basedOnQuestion existed", async () => {
  const inputs: any[] = [];
  const service = new ReportsService(undefined, {
    evaluateResponse: async (input: any) => {
      inputs.push(input);
      return evaluateResponse(input);
    },
  } as any);
  const createdAt = new Date("2026-07-20T10:00:00.000Z");

  await (service as any).evaluateSessionResponses({
    id: "session-legacy-follow-up",
    organizationId: "org-1",
    template: {
      title: "SE Assessment",
      modules: [{ id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 }],
    },
    responses: [{
      id: "response-1",
      responseText: "I rolled back the deployment.",
      responseJson: { aiFollowUp: { answer: "The error budget was exhausted." } },
      question: {
        id: "question-1",
        questionText: "Describe a rollout that went wrong.",
        rubric: ["ownership"],
        module: { id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 },
      },
    }],
    aiMessages: [
      {
        id: "legacy-candidate",
        role: "candidate",
        content: "I rolled back the deployment.",
        metadata: { question: "Describe a rollout that went wrong." },
        createdAt,
      },
      {
        id: "legacy-assistant",
        role: "assistant",
        content: "What signal made you roll it back?",
        metadata: { provider: "deepseek" },
        createdAt,
      },
    ],
    interviewerFollowUps: [],
    codeSubmissions: [],
  });

  assert.match(inputs[0].responseText, /The error budget was exhausted/);
  assert.deepEqual(inputs[0].questionContext, [
    "Question: Describe a rollout that went wrong.\nAI follow-up: What signal made you roll it back?",
  ]);
});

test("a keyword-stuffed question snapshot in responseJson cannot change the candidate's score", async () => {
  // Answers now carry a frozen copy of their question at responseJson.questionSnapshot.
  // responseJson is serialised into the SCORED text, so an assessment author who writes
  // a keyword-stuffed question would otherwise be scoring their own words as the
  // candidate's. Same candidate answer in both runs; only the snapshot wording differs.
  const buildSession = (snapshotQuestionText: string) => ({
    id: "session-snapshot",
    organizationId: "org-1",
    template: {
      title: "SE Assessment",
      modules: [{ id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 }],
    },
    responses: [
      {
        id: "response-1",
        responseText: "I rolled back the deployment and explained the failure to the team.",
        responseJson: {
          selectedOption: "structured",
          questionSnapshot: {
            questionText: snapshotQuestionText,
            rubric: ["ownership"],
            moduleTitle: "Behavioral",
            moduleType: "behavioral",
            weight: 1,
            capturedAt: "2026-07-21T09:00:00.000Z",
          },
        },
        question: {
          id: "question-1",
          questionText: "Describe a rollout that went wrong.",
          rubric: ["ownership"],
          module: { id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 },
        },
      },
    ],
    interviewerFollowUps: [],
    codeSubmissions: [],
  });

  const aiInputs: any[] = [];
  // The fake provider only records what the scorer was handed, then runs the real
  // deterministic scorer, so the score comparison below is exact.
  const fakeAi = {
    evaluateResponse: async (input: any) => {
      aiInputs.push(input);
      return evaluateResponse(input);
    },
  };
  const service = new ReportsService(undefined, fakeAi as any);

  const [neutral] = await (service as any).evaluateSessionResponses(buildSession("Describe a rollout that went wrong."));
  const [leading] = await (service as any).evaluateSessionResponses(
    buildSession(
      "Would you say you took full ownership, measured the impact with a percent metric, tested the result on a consistent-hash ring, and explained the trade-off to the client team because the customer outcome mattered?",
    ),
  );

  assert.equal(
    leading.score,
    neutral.score,
    "a keyword-stuffed snapshotted question must not inflate the candidate's score",
  );
  assert.deepEqual(leading.criteriaScores, neutral.criteriaScores);
  assert.deepEqual(leading.evidence, neutral.evidence);
  assert.ok(
    leading.evidence.every((quote: string) => !quote.includes("consistent-hash")),
    "an evidence quote must never be able to return snapshotted question wording",
  );

  const [, stuffed] = aiInputs;
  assert.doesNotMatch(stuffed.responseText, /consistent-hash/, "the snapshot is stripped before responseJson is scored");
  assert.doesNotMatch(stuffed.responseText, /questionSnapshot/);
  assert.match(stuffed.responseText, /selectedOption/, "the candidate's own structured answer is still scored");
  assert.deepEqual(
    stuffed.questionContext,
    [
      "Question: Would you say you took full ownership, measured the impact with a percent metric, tested the result on a consistent-hash ring, and explained the trade-off to the client team because the customer outcome mattered?",
    ],
    "the question wording reaches the scorer as context only",
  );
});

test("report scoring uses the rubric and question wording snapshotted at answer time", async () => {
  const aiInputs: any[] = [];
  const fakeAi = {
    evaluateResponse: async (input: any) => {
      aiInputs.push(input);
      return evaluateResponse(input);
    },
  };
  const service = new ReportsService(undefined, fakeAi as any);

  await (service as any).evaluateSessionResponses({
    id: "session-frozen",
    organizationId: "org-1",
    template: {
      title: "SE Assessment",
      modules: [{ id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 }],
    },
    responses: [
      {
        // Answered before the template was edited: the frozen copy wins over the live row.
        id: "response-1",
        responseText: "I rolled back the deployment and explained the failure to the team.",
        questionSnapshot: {
          rubricVersion: 1,
          questionText: "Describe a rollout that went wrong.",
          rubric: ["ownership"],
          capturedAt: "2026-07-21T09:00:00.000Z",
        },
        question: {
          id: "question-1",
          questionText: "Edited later: describe a launch you led.",
          rubric: ["latency budgeting"],
          module: { id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 },
        },
      },
      {
        // Saved before snapshots existed, so the live template row is the only source.
        id: "response-2",
        responseText: "I listened to the team and measured the result of the change.",
        question: {
          id: "question-2",
          questionText: "How do you work with others?",
          rubric: ["teamwork"],
          module: { id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 },
        },
      },
      {
        // The question carried no rubric when it was answered; criteria added to the
        // template afterwards were never put to this candidate.
        id: "response-3",
        responseText: "I clarified the deadline with the client and tested the fix.",
        questionSnapshot: {
          rubricVersion: 1,
          questionText: "What did you do next?",
          rubric: [],
          capturedAt: "2026-07-21T09:05:00.000Z",
        },
        question: {
          id: "question-3",
          questionText: "What did you do next?",
          rubric: ["newly added criterion"],
          module: { id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 },
        },
      },
    ],
    interviewerFollowUps: [],
    codeSubmissions: [],
  });

  assert.equal(aiInputs.length, 1);
  assert.deepEqual(
    aiInputs[0].rubric,
    ["ownership", "teamwork"],
    "an edited rubric cannot re-score an answered question, and a later-added criterion never applies",
  );
  assert.deepEqual(aiInputs[0].questionContext, [
    "Question: Describe a rollout that went wrong.",
    "Question: How do you work with others?",
    "Question: What did you do next?",
  ]);
});

test("reports ignore unversioned rubric snapshots from the unfinished storage format", async () => {
  const aiInputs: any[] = [];
  const service = new ReportsService(undefined, {
    evaluateResponse: async (input: any) => {
      aiInputs.push(input);
      return evaluateResponse(input);
    },
  } as any);

  await (service as any).evaluateSessionResponses({
    id: "session-untrusted-snapshot",
    organizationId: "org-1",
    template: {
      title: "SE Assessment",
      modules: [{ id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 }],
    },
    responses: [{
      id: "response-1",
      responseText: "I coordinated the rollback with the team.",
      responseJson: {
        questionSnapshot: {
          questionText: "Original question wording.",
          rubric: ["attacker controlled rubric"],
        },
      },
      question: {
        id: "question-1",
        questionText: "Current question wording.",
        rubric: ["ownership"],
        module: { id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 },
      },
    }],
    aiMessages: [],
    interviewerFollowUps: [],
    codeSubmissions: [],
  });

  assert.deepEqual(aiInputs[0].rubric, ["ownership"]);
  assert.deepEqual(aiInputs[0].questionContext, ["Question: Original question wording."]);
});

test("reports repair verbose prebuilt rubrics already seeded in the database", async () => {
  const aiInputs: any[] = [];
  const service = new ReportsService(undefined, {
    evaluateResponse: async (input: any) => {
      aiInputs.push(input);
      return evaluateResponse(input);
    },
  } as any);
  const questionText = "Describe a time you owned a problem beyond your assigned ticket. What was the outcome?";

  await (service as any).evaluateSessionResponses({
    id: "session-seeded-before-fix",
    organizationId: "org-1",
    template: {
      title: "Software Engineer Assessment",
      modules: [{ id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 }],
    },
    responses: [{
      id: "response-1",
      responseText: "I found an abandoned reliability issue, fixed it, and reduced errors.",
      question: {
        id: "question-1",
        questionText,
        rubric: [
          "describe the problem nobody had picked up",
          "say what they did beyond the assigned ticket",
          "give the result in numbers or user terms",
          "describe how they saw it through to the end",
        ],
        module: { id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 },
      },
    }],
    aiMessages: [],
    interviewerFollowUps: [],
    codeSubmissions: [],
  });

  assert.deepEqual(aiInputs[0].rubric, ["ownership", "initiative", "impact", "follow-through"]);
});

test("reports preserve concise custom rubrics on prebuilt question wording", async () => {
  const aiInputs: any[] = [];
  const service = new ReportsService(undefined, {
    evaluateResponse: async (input: any) => {
      aiInputs.push(input);
      return evaluateResponse(input);
    },
  } as any);

  await (service as any).evaluateSessionResponses({
    id: "session-custom-rubric",
    organizationId: "org-1",
    template: {
      title: "Customized Assessment",
      modules: [{ id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 }],
    },
    responses: [{
      id: "response-1",
      responseText: "I fixed an abandoned reliability issue.",
      question: {
        id: "question-1",
        questionText: "Describe a time you owned a problem beyond your assigned ticket. What was the outcome?",
        rubric: ["reliability", "customer safety"],
        module: { id: "module-1", title: "Behavioral", moduleType: "BEHAVIORAL", weight: 1 },
      },
    }],
    aiMessages: [],
    interviewerFollowUps: [],
    codeSubmissions: [],
  });

  assert.deepEqual(aiInputs[0].rubric, ["reliability", "customer safety"]);
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

test("getReport reports not-ready instead of returning fabricated candidate data", async () => {
  const fakePrisma = {
    interviewSession: { findFirst: async () => ({ id: "session-1", organizationId: "org-1" }) },
    candidateReport: { findUnique: async () => null },
  };
  const service = new ReportsService(fakePrisma as any);

  await assert.rejects(() => service.getReport("session-1", organizationAccess), /report is not ready/i);
});
