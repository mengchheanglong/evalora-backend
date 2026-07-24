import { test } from "node:test";
import { strict as assert } from "node:assert";
import { AiService, type AiProviderClient } from "../src/modules/ai/ai.service";
import { DeepSeekAiProvider, type DeepSeekFetch } from "../src/modules/ai/deepseek.provider";
import type { EvaluateResponseInput, EvaluationResultDto } from "../src/modules/ai/evaluation.service";

const fallbackInput: EvaluateResponseInput = {
  moduleType: "leadership",
  moduleTitle: "Leadership Scenario",
  responseText: "I would listen to both teammates, clarify priorities, explain the trade-off, and measure the impact after release.",
  rubric: ["clarity", "empathy", "decision-making"],
};

class ProviderStub implements AiProviderClient {
  constructor(private readonly next: Partial<EvaluationResultDto> | Error) {}

  async evaluateResponse() {
    if (this.next instanceof Error) throw this.next;
    return this.next;
  }
}

class CapturingProviderStub implements AiProviderClient {
  captured?: EvaluateResponseInput;

  async evaluateResponse(input: EvaluateResponseInput) {
    this.captured = input;
    return { score: 4 };
  }
}

test("AiService uses provider output while preserving the evaluation DTO contract", async () => {
  const service = new AiService(
    new ProviderStub({
      score: 4.8,
      criteriaScores: { clarity: 5, empathy: 4.5, "decision-making": 4.8 },
      feedback: "Strong scenario response grounded in collaboration evidence.",
      strengths: ["Balances stakeholder needs"],
      improvementAreas: ["Add a measurable follow-up metric"],
      evidence: ["clarify priorities"],
    }),
  );

  const result = await service.evaluateResponse(fallbackInput);

  assert.equal(result.moduleType, "leadership");
  assert.equal(result.moduleTitle, "Leadership Scenario");
  assert.equal(result.weight, 1);
  assert.equal(result.score, 4.8);
  assert.deepEqual(result.criteriaScores, { clarity: 5, empathy: 4.5, "decision-making": 4.8 });
  assert.deepEqual(result.strengths, ["Balances stakeholder needs"]);
  assert.deepEqual(result.improvementAreas, ["Add a measurable follow-up metric"]);
  assert.deepEqual(result.evidence, ["clarify priorities"]);
  assert.match(result.advisoryNotice, /advisory/i);
  assert.doesNotMatch(result.advisoryNotice, /hire|reject|diagnosis/i);
});

test("AiService preserves exact score anchors and never sends a blank answer to the provider", async () => {
  let providerCalls = 0;
  const provider: AiProviderClient = {
    async evaluateResponse() {
      providerCalls += 1;
      return { score: 1.25 };
    },
  };
  const service = new AiService(provider);

  const blank = await service.evaluateResponse({ moduleType: "behavioral", responseText: "" });
  const limited = await service.evaluateResponse({ ...fallbackInput, responseText: "I clarify the goal with the team and explain my first step." });

  assert.equal(blank.score, 0);
  assert.equal(limited.score, 1.25);
  assert.equal(Math.round(limited.score * 20), 25);
  assert.equal(providerCalls, 1);
});

test("AiService removes provider strengths when the final score is zero", async () => {
  const service = new AiService(
    new ProviderStub({
      score: 0,
      strengths: ["Communicates reasoning clearly"],
      improvementAreas: ["Provide valid evidence"],
    }),
  );

  const result = await service.evaluateResponse(fallbackInput);

  assert.equal(result.score, 0);
  assert.deepEqual(result.strengths, []);
  assert.deepEqual(result.improvementAreas, ["Provide valid evidence"]);
});

test("AiService falls back to deterministic rubric evaluation when provider evaluation fails", async () => {
  const service = new AiService(new ProviderStub(new Error("provider unavailable")));

  const result = await service.evaluateResponse(fallbackInput);

  assert.equal(result.moduleType, "leadership");
  assert.ok(result.score >= 1 && result.score <= 5);
  assert.match(result.feedback, /fallback/i);
  assert.ok(result.evidence.length > 0);
  assert.match(result.advisoryNotice, /advisory/i);
});

test("AiService sends module-specific default rubrics to the provider when callers omit rubrics", async () => {
  const provider = new CapturingProviderStub();
  const service = new AiService(provider);

  const result = await service.evaluateResponse({
    moduleType: "problem_solving",
    responseText: "I would isolate the root cause, compare trade-offs, test the riskiest assumption, and measure the result.",
  });

  assert.ok(provider.captured?.rubric?.includes("root-cause analysis"));
  assert.ok(provider.captured?.rubric?.includes("trade-off reasoning"));
  assert.ok(Object.keys(result.criteriaScores).includes("root-cause analysis"));
  assert.equal(result.moduleTitle, "Problem Solving");
});

test("DeepSeekAiProvider posts OpenAI-compatible chat completions and parses JSON output", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: DeepSeekFetch = async (url, init) => {
    requests.push({ url, init });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  score: 4.4,
                  criteriaScores: { clarity: 4.4 },
                  feedback: "Clear, evidence-based answer.",
                  strengths: ["Uses clear reasoning"],
                  improvementAreas: ["Add more measurable impact"],
                  evidence: ["explain the trade-off"],
                }),
              },
            },
          ],
        };
      },
    };
  };

  const provider = new DeepSeekAiProvider({ baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash", apiKey: "test-key" }, fetchImpl);
  const result = await provider.evaluateResponse(fallbackInput);

  assert.equal(requests[0].url, "https://api.deepseek.com/v1/chat/completions");
  assert.equal(requests[0].init.method, "POST");
  assert.equal((requests[0].init.headers as Record<string, string>).Authorization, "Bearer test-key");
  assert.match(String(requests[0].init.body), /deepseek-v4-flash/);
  assert.match(String(requests[0].init.body), /number from 0 to 5/);
  assert.match(String(requests[0].init.body), /factually wrong/);
  assert.match(String(requests[0].init.body), /1\.25/);
  assert.equal(result.score, 4.4);
  assert.deepEqual(result.evidence, ["explain the trade-off"]);
});
