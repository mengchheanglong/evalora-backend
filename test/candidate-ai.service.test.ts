import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CandidateAiService, compactAdaptiveHistory } from "../src/modules/ai/candidate-ai.service";

const openSession = {
  id: "session-1",
  status: "IN_PROGRESS",
  expiresAt: null,
  template: {
    title: "Frontend Developer Assessment",
    roleType: "Frontend Developer",
    modules: [{ title: "Frontend Interview" }],
  },
};

test("adaptive question generation includes every saved answer and is idempotent", async () => {
  const assistantMessages: Array<{ role: string; content: string; metadata: Record<string, unknown> }> = [];
  const authoredResponses = Array.from({ length: 21 }, (_, index) => ({
    responseText: `Candidate answer ${index + 1} with concrete evidence and result.`,
    question: { questionText: `Authored question ${index + 1}` },
  }));
  const capturedHistory: string[][] = [];
  let providerCalls = 0;

  const prisma = {
    interviewSession: { findFirst: async () => openSession },
    response: {
      findMany: async () => authoredResponses,
    },
    aIMessage: {
      findMany: async () => assistantMessages,
      create: async ({ data }: any) => {
        assistantMessages.push(data);
        return data;
      },
    },
  };
  const aiService = {
    generateInterviewQuestion: async (input: { conversationHistory: string[] }) => {
      providerCalls += 1;
      capturedHistory.push(input.conversationHistory);
      return {
        question: `Tailored question ${providerCalls}`,
        rubric: ["role relevance"],
        provider: "deepseek",
      };
    },
  };
  const service = new CandidateAiService(prisma as any, aiService as any);

  const first = await service.adaptiveQuestions("ACCESS-1", 3);
  const second = await service.adaptiveQuestions("ACCESS-1", 3);
  const restored = await service.existingAdaptiveQuestions("ACCESS-1");

  assert.deepEqual(first.questions, ["Tailored question 1", "Tailored question 2", "Tailored question 3"]);
  assert.deepEqual(second.questions, first.questions);
  assert.deepEqual(restored.questions, first.questions);
  assert.equal(providerCalls, 3);
  assert.equal(assistantMessages.length, 3);
  for (let index = 1; index <= 21; index += 1) {
    assert.ok(capturedHistory[0].some((entry) => entry.includes(`Authored question ${index}`)));
    assert.ok(capturedHistory[0].some((entry) => entry.includes(`Candidate answer ${index}`)));
  }
  assert.ok(capturedHistory[0].some((entry) => entry.includes("Adaptive question slot 1")));
  assert.ok(capturedHistory[1].some((entry) => entry.includes("Adaptive question slot 2")));
  assert.ok(capturedHistory[2].some((entry) => entry.includes("Adaptive question slot 3")));
});

test("adaptive answer saves update the same response on retry", async () => {
  const messages: Array<{ role: string; content: string; metadata: Record<string, unknown> }> = [
    {
      role: "assistant",
      content: "Which earlier example best demonstrates your readiness?",
      metadata: { adaptive: true, questionId: "ai-adaptive-0", provider: "deepseek" },
    },
  ];
  const savedResponses: Array<{ id: string; responseText: string; responseJson: Record<string, unknown> }> = [];
  let updates = 0;

  const prisma = {
    interviewSession: { findFirst: async () => openSession },
    response: {
      findMany: async () => savedResponses,
      create: async ({ data }: any) => {
        const created = { id: `response-${savedResponses.length + 1}`, ...data };
        savedResponses.push(created);
        return created;
      },
      update: async ({ where, data }: any) => {
        updates += 1;
        const existing = savedResponses.find((response) => response.id === where.id);
        Object.assign(existing!, data);
        return existing;
      },
      deleteMany: async ({ where }: any) => {
        const ids = new Set(where.id.in);
        const retained = savedResponses.filter((response) => !ids.has(response.id));
        savedResponses.splice(0, savedResponses.length, ...retained);
        return { count: ids.size };
      },
    },
    aIMessage: {
      findMany: async ({ where }: any) => messages.filter((message) => !where.role || message.role === where.role),
      create: async ({ data }: any) => {
        messages.push(data);
        return data;
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  };
  const service = new CandidateAiService(prisma as any, {} as any);
  const question = "Which earlier example best demonstrates your readiness?";

  await Promise.all([
    service.saveAdaptiveAnswer("ACCESS-1", {
      questionId: "ai-adaptive-0",
      question,
      answer: "My first answer.",
    }),
    service.saveAdaptiveAnswer("ACCESS-1", {
      questionId: "ai-adaptive-0",
      question,
      answer: "My revised answer.",
    }),
  ]);

  assert.equal(savedResponses.length, 1);
  assert.equal(updates, 1);
  assert.match(savedResponses[0].responseText, /My revised answer/);
  assert.equal(savedResponses[0].responseJson.questionId, "ai-adaptive-0");
  assert.equal(messages.filter((message) => message.role === "candidate").length, 1);
});

test("adaptive context compaction retains every authored response", () => {
  const responses = Array.from({ length: 193 }, (_, index) => ({
    question: { questionText: `Question ${index + 1}` },
    responseText: `Answer ${index + 1} ${"detail ".repeat(100)}`,
  }));

  const history = compactAdaptiveHistory(responses);

  assert.equal(history.length, 193);
  assert.ok(history.every((entry, index) => entry.includes(`Question ${index + 1}`)));
  assert.ok(history.every((entry, index) => entry.includes(`Answer ${index + 1}`)));
  assert.ok(history.join("\n").length < 50_000);
});
