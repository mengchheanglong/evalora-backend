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
  // The answer column holds the candidate's words and nothing else; the question it
  // answers is structured data, so no reader has to parse it back out.
  assert.equal(savedResponses[0].responseText, "My revised answer.");
  assert.equal(savedResponses[0].responseJson.question, question);
  assert.equal(savedResponses[0].responseJson.questionId, "ai-adaptive-0");
  assert.equal(messages.filter((message) => message.role === "candidate").length, 1);
});

test("a follow-up names the question it was generated from", async () => {
  const messages: Array<{ role: string; content: string; metadata: Record<string, unknown> }> = [];
  const prisma = {
    interviewSession: { findFirst: async () => openSession },
    aIMessage: {
      findMany: async () => messages.map((message, index) => ({ id: `message-${index}`, createdAt: new Date(0), ...message })),
      create: async ({ data }: any) => {
        messages.push(data);
        return data;
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  };
  const aiService = {
    generateFollowUp: async () => ({ question: "Which trade-off did that rollback cost you?", basedOn: "candidate_answer", provider: "deepseek" }),
  };
  const service = new CandidateAiService(prisma as any, aiService as any);

  await service.followUp("ACCESS-1", { question: "Describe a hard deployment.", answer: "I rolled it back once the error budget burned." });
  const conversation = await service.conversation("ACCESS-1");
  const probe = conversation.find((message) => message.role === "assistant");

  // The pairing lives on the message that asked the question, so the candidate app can
  // restore the follow-up without the question being copied onto the saved answer.
  assert.equal(probe?.content, "Which trade-off did that rollback cost you?");
  assert.equal(probe?.basedOnQuestion, "Describe a hard deployment.");
  // Nothing else from metadata reaches a candidate: it also carries scoring rubrics.
  assert.deepEqual(Object.keys(probe ?? {}).sort(), ["basedOnQuestion", "content", "createdAt", "id", "role"]);
});

test("conversation recovers the parent question for follow-ups saved before provenance metadata", async () => {
  const createdAt = new Date("2026-07-20T10:00:00.000Z");
  const messages = [
    {
      id: "candidate-message",
      role: "candidate",
      content: "I rolled the deployment back.",
      metadata: { question: "Describe a difficult deployment." },
      createdAt,
    },
    {
      id: "assistant-message",
      role: "assistant",
      content: "What signal made you roll it back?",
      metadata: { provider: "deepseek" },
      createdAt,
    },
  ];
  const prisma = {
    interviewSession: { findFirst: async () => openSession },
    aIMessage: { findMany: async () => messages },
  };
  const service = new CandidateAiService(prisma as any, {} as any);

  const conversation = await service.conversation("ACCESS-1");
  const probe = conversation.find((message) => message.id === "assistant-message");

  assert.equal(probe?.basedOnQuestion, "Describe a difficult deployment.");
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
