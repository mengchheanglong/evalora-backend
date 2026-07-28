import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CandidateAiService, type FollowUpStreamHandler } from "../src/modules/ai/candidate-ai.service";
import { DeepSeekAiProvider, type DeepSeekFetch } from "../src/modules/ai/deepseek.provider";

const openSession = {
  id: "session-1",
  status: "IN_PROGRESS",
  expiresAt: null,
  template: {
    title: "Frontend Developer Assessment",
    roleType: "Frontend Developer",
    modules: [{
      id: "module-ai",
      title: "AI Interview",
      moduleType: "AI_INTERVIEW",
      settings: { adaptiveQuestionCount: 3 },
      questions: [],
    }],
  },
};

const FALLBACK_QUESTION = "What trade-off did you consider, and how did you decide between options?";

function sseFrames(...payloads: string[]): string {
  return payloads.map((payload) => `data: ${payload}\n\n`).join("");
}

function deltaFrame(content: string): string {
  return JSON.stringify({ choices: [{ delta: { content } }] });
}

/** Splits the whole SSE body into fixed-size byte slices so lines - and multi-byte
 *  characters - land in the middle of a read, exactly as they do on a real socket. */
function byteChunks(body: string, size: number): Uint8Array[] {
  const bytes = new TextEncoder().encode(body);
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += size) chunks.push(bytes.slice(offset, offset + size));
  return chunks;
}

function streamingFetch(chunks: Uint8Array[], requests: RequestInit[] = []): DeepSeekFetch {
  return async (_url, init) => {
    requests.push(init);
    let index = 0;
    return {
      ok: true,
      status: 200,
      async json() {
        return {};
      },
      body: {
        getReader: () => ({
          read: async () => (index < chunks.length ? { done: false, value: chunks[index++] } : { done: true }),
        }),
      },
    };
  };
}

/** Delivers every chunk and then leaves the socket open forever, the way a healthy but
 *  slow model behaves while it is still writing when a budget expires. */
function stallingFetch(chunks: Uint8Array[]): DeepSeekFetch {
  return async () => {
    let index = 0;
    return {
      ok: true,
      status: 200,
      async json() {
        return {};
      },
      body: {
        getReader: () => ({
          read: async () => (index < chunks.length ? { done: false, value: chunks[index++] } : new Promise<never>(() => {})),
        }),
      },
    };
  };
}

function createPrisma({ transactionFailures = 0 } = {}) {
  const messages: Array<{ role: string; content: string; metadata: Record<string, unknown> }> = [];
  const state = { transactionAttempts: 0 };
  const client = {
    interviewSession: { findFirst: async () => openSession },
    aIMessage: {
      findMany: async () => messages,
      // Prisma only executes an operation when the transaction runs, so the mock
      // records rows at execution time; otherwise a retried transaction would look
      // like it had already written its rows.
      create: ({ data }: any) => ({
        run: () => {
          messages.push(data);
          return data;
        },
      }),
    },
    $transaction: async (operations: Array<{ run: () => unknown }>) => {
      state.transactionAttempts += 1;
      if (state.transactionAttempts <= transactionFailures) throw new Error("terminating connection due to administrator command");
      return operations.map((operation) => operation.run());
    },
  };
  return { messages, state, client };
}

function createHandler() {
  const deltas: string[] = [];
  const replacements: string[] = [];
  const handler: FollowUpStreamHandler = {
    onDelta: (delta) => deltas.push(delta),
    onReplace: (question) => replacements.push(question),
  };
  return { deltas, replacements, handler };
}

/** What the candidate ends up reading: replaces drop everything shown before them. */
function renderedText(deltas: string[], replacements: string[]): string {
  return replacements.length ? replacements[replacements.length - 1] : deltas.join("");
}

test("streamChat assembles deltas that arrive split across network reads", async () => {
  const body = sseFrames(deltaFrame("Which"), deltaFrame(" trade-off"), deltaFrame(" mattered most at the café?"), "[DONE]");
  const requests: RequestInit[] = [];
  const provider = new DeepSeekAiProvider(
    { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash", apiKey: "test-key" },
    streamingFetch(byteChunks(body, 7), requests),
  );
  const deltas: string[] = [];

  const result = await provider.streamFollowUp({ question: "Describe a project.", answer: "I shipped a checkout rewrite." }, (delta) => deltas.push(delta));

  assert.deepEqual(deltas, ["Which", " trade-off", " mattered most at the café?"]);
  assert.equal(result.text, "Which trade-off mattered most at the café?");
  assert.equal(result.truncated, false);
  assert.equal(requests.length, 1);
  assert.match(String(requests[0].body), /"stream":true/);
  assert.equal((requests[0].headers as Record<string, string>).Authorization, "Bearer test-key");
});

test("streamChat stops at [DONE] and ignores anything sent after it", async () => {
  const body = sseFrames(deltaFrame("Kept"), "[DONE]", deltaFrame(" dropped"));
  const provider = new DeepSeekAiProvider(
    { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash", apiKey: "test-key" },
    streamingFetch(byteChunks(body, 512)),
  );
  const deltas: string[] = [];

  const result = await provider.streamChat("Task", { payload: true }, (delta) => deltas.push(delta));

  assert.deepEqual(deltas, ["Kept"]);
  assert.equal(result.text, "Kept");
  assert.equal(result.truncated, false);
});

test("streamChat keeps a stream alive through keep-alive and half-written frames", async () => {
  const body = `: keep-alive\n\n${sseFrames(deltaFrame("First"), deltaFrame(" second"))}data: {"choices":[{"delta":{"content":"`;
  const provider = new DeepSeekAiProvider(
    { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash", apiKey: "test-key" },
    streamingFetch(byteChunks(body, 5)),
  );
  const deltas: string[] = [];

  const result = await provider.streamChat("Task", {}, (delta) => deltas.push(delta));

  assert.deepEqual(deltas, ["First", " second"]);
  assert.equal(result.text, "First second");
});

test("streamChat gives a slow model longer than the first-token budget before giving up", async () => {
  const body = sseFrames(deltaFrame("Still"), deltaFrame(" writing"));
  const provider = new DeepSeekAiProvider(
    {
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-v4-flash",
      apiKey: "test-key",
      streamFirstTokenTimeoutMs: 40,
      streamTotalBudgetMs: 300,
    },
    stallingFetch(byteChunks(body, 512)),
  );
  const deltas: string[] = [];
  const startedAt = Date.now();

  const result = await provider.streamChat("Task", {}, (delta) => deltas.push(delta));

  // Tokens were flowing, so the short first-token budget must not have ended the read.
  assert.ok(Date.now() - startedAt >= 250, "stream ended before the overall budget");
  assert.deepEqual(deltas, ["Still", " writing"]);
  assert.equal(result.text, "Still writing");
  assert.equal(result.truncated, true);
});

test("streamChat reports a silent upstream as truncated with no text", async () => {
  const provider = new DeepSeekAiProvider(
    {
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-v4-flash",
      apiKey: "test-key",
      streamFirstTokenTimeoutMs: 40,
      streamTotalBudgetMs: 5_000,
    },
    stallingFetch([]),
  );
  const deltas: string[] = [];
  const startedAt = Date.now();

  const result = await provider.streamChat("Task", {}, (delta) => deltas.push(delta));

  assert.equal(deltas.length, 0);
  assert.equal(result.text, "");
  assert.equal(result.truncated, true);
  assert.ok(Date.now() - startedAt < 2_000, "a silent upstream must fail on the short budget");
});

test("candidate follow-up streaming persists the streamed question", async () => {
  const prisma = createPrisma();
  const body = sseFrames(deltaFrame("How did"), deltaFrame(" you measure it?"), "[DONE]");
  const provider = new DeepSeekAiProvider(
    { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash", apiKey: "test-key" },
    streamingFetch(byteChunks(body, 9)),
  );
  const service = new CandidateAiService(prisma.client as any, {} as any, provider);
  const { deltas, replacements, handler } = createHandler();

  const generated = await service.followUpStream("ACCESS-1", { question: "Describe a project.", answer: "I shipped a checkout rewrite." }, handler);

  assert.equal(generated.provider, "deepseek");
  assert.equal(generated.question, "How did you measure it?");
  assert.equal(deltas.join(""), "How did you measure it?");
  assert.deepEqual(replacements, []);
  assert.equal(prisma.messages.filter((message) => message.role === "assistant")[0].content, "How did you measure it?");
  assert.equal(prisma.messages.filter((message) => message.role === "candidate")[0].content, "I shipped a checkout rewrite.");
});

test("candidate follow-up streaming falls back to animated deltas when the upstream fails", async () => {
  const prisma = createPrisma();
  const failingFetch: DeepSeekFetch = async () => ({
    ok: false,
    status: 502,
    async json() {
      return {};
    },
    async text() {
      return "upstream unavailable";
    },
  });
  const provider = new DeepSeekAiProvider({ baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash", apiKey: "test-key" }, failingFetch);
  const service = new CandidateAiService(prisma.client as any, {} as any, provider);
  const { deltas, replacements, handler } = createHandler();

  const generated = await service.followUpStream("ACCESS-1", { question: "Describe a project.", answer: "I shipped a checkout rewrite." }, handler);

  assert.equal(generated.provider, "fallback");
  assert.equal(generated.question, FALLBACK_QUESTION);
  assert.ok(deltas.length > 1);
  assert.deepEqual(replacements, []);
  assert.equal(deltas.join(""), FALLBACK_QUESTION);
  assert.equal(prisma.messages.filter((message) => message.role === "assistant")[0].content, FALLBACK_QUESTION);
});

test("candidate follow-up streaming falls back without any request when the API key is missing", async () => {
  const prisma = createPrisma();
  let calls = 0;
  const countingFetch: DeepSeekFetch = async () => {
    calls += 1;
    throw new Error("network should not be reached");
  };
  const provider = new DeepSeekAiProvider({ baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash" }, countingFetch);
  const service = new CandidateAiService(prisma.client as any, {} as any, provider);
  const { deltas, handler } = createHandler();

  const generated = await service.followUpStream("ACCESS-1", { question: "Describe a project.", answer: "I shipped a checkout rewrite." }, handler);

  assert.equal(calls, 0);
  assert.equal(generated.provider, "fallback");
  assert.equal(deltas.join(""), FALLBACK_QUESTION);
});

test("candidate follow-up streaming rejects a closed session before any delta", async () => {
  const prisma = createPrisma();
  const closedClient = { ...prisma.client, interviewSession: { findFirst: async () => ({ ...openSession, status: "COMPLETED" }) } };
  const provider = new DeepSeekAiProvider({ baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash" });
  const service = new CandidateAiService(closedClient as any, {} as any, provider);
  const { deltas, handler } = createHandler();

  await assert.rejects(
    () => service.followUpStream("ACCESS-1", { question: "Describe a project.", answer: "An answer." }, handler),
    /Active interview session/i,
  );
  assert.equal(deltas.length, 0);
});

test("a stream cut after a complete question keeps that question instead of appending the fallback", async () => {
  const prisma = createPrisma();
  const body = sseFrames(deltaFrame("Which trade-off between latency and cost mattered most, and why?"), deltaFrame(" And how did you"));
  const provider = new DeepSeekAiProvider(
    {
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-v4-flash",
      apiKey: "test-key",
      streamFirstTokenTimeoutMs: 500,
      streamTotalBudgetMs: 120,
    },
    stallingFetch(byteChunks(body, 64)),
  );
  const service = new CandidateAiService(prisma.client as any, {} as any, provider);
  const { deltas, replacements, handler } = createHandler();

  const generated = await service.followUpStream("ACCESS-1", { question: "Describe a project.", answer: "I shipped a checkout rewrite." }, handler);

  const expected = "Which trade-off between latency and cost mattered most, and why?";
  assert.equal(generated.provider, "deepseek");
  assert.equal(generated.question, expected);
  // The dangling clause is withdrawn by a replace, never completed by more text.
  assert.deepEqual(replacements, [expected]);
  assert.equal(renderedText(deltas, replacements), expected);
  assert.ok(!renderedText(deltas, replacements).includes("And how did you"));
  assert.equal(prisma.messages.filter((message) => message.role === "assistant")[0].content, expected);
});

test("a stream cut mid-clause never exposes the fragment before falling back", async () => {
  const prisma = createPrisma();
  const body = sseFrames(deltaFrame("Which trade-off between latency and"));
  const provider = new DeepSeekAiProvider(
    {
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-v4-flash",
      apiKey: "test-key",
      streamFirstTokenTimeoutMs: 500,
      streamTotalBudgetMs: 120,
    },
    stallingFetch(byteChunks(body, 64)),
  );
  const service = new CandidateAiService(prisma.client as any, {} as any, provider);
  const { deltas, replacements, handler } = createHandler();

  const generated = await service.followUpStream("ACCESS-1", { question: "Describe a project.", answer: "I shipped a checkout rewrite." }, handler);

  assert.equal(generated.provider, "fallback");
  assert.equal(generated.question, FALLBACK_QUESTION);
  assert.deepEqual(replacements, []);
  assert.ok(!deltas.join("").includes("Which trade-off between latency and"));
  assert.equal(renderedText(deltas, replacements), FALLBACK_QUESTION);
  assert.equal(prisma.messages.filter((message) => message.role === "assistant")[0].content, FALLBACK_QUESTION);
});

test("a complete answer can finish without creating a forced follow-up", async () => {
  const prisma = createPrisma();
  const body = sseFrames(deltaFrame("[NO_FOLLOW_UP]"), "[DONE]");
  const provider = new DeepSeekAiProvider(
    { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash", apiKey: "test-key" },
    streamingFetch(byteChunks(body, 8)),
  );
  const service = new CandidateAiService(prisma.client as any, {} as any, provider);
  const { deltas, replacements, handler } = createHandler();

  const generated = await service.followUpStream(
    "ACCESS-1",
    {
      question: "Describe a project and its outcome.",
      answer: "I led the checkout rewrite, chose a staged migration to reduce risk, and measured a 32% reduction in failed payments after launch.",
    },
    handler,
  );

  assert.equal(generated.shouldAsk, false);
  assert.equal(generated.question, "");
  assert.deepEqual(deltas, []);
  assert.deepEqual(replacements, []);
  assert.equal(prisma.messages.length, 0);
});

test("provider failure does not force a probe after a complete answer", async () => {
  const prisma = createPrisma();
  const provider = new DeepSeekAiProvider({ baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash" });
  const service = new CandidateAiService(prisma.client as any, {} as any, provider);
  const { deltas, handler } = createHandler();

  const generated = await service.followUpStream(
    "ACCESS-1",
    {
      question: "Describe a project and its outcome.",
      answer: "I led the checkout rewrite, chose a staged migration because it reduced release risk, and measured a 32% reduction in failed payments after launch.",
    },
    handler,
  );

  assert.equal(generated.shouldAsk, false);
  assert.equal(deltas.length, 0);
  assert.equal(prisma.messages.length, 0);
});

test("a stream that never starts falls back with animated deltas and no replacement", async () => {
  const prisma = createPrisma();
  const provider = new DeepSeekAiProvider(
    {
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-v4-flash",
      apiKey: "test-key",
      streamFirstTokenTimeoutMs: 40,
      streamTotalBudgetMs: 5_000,
    },
    stallingFetch([]),
  );
  const service = new CandidateAiService(prisma.client as any, {} as any, provider);
  const { deltas, replacements, handler } = createHandler();

  const generated = await service.followUpStream("ACCESS-1", { question: "Describe a project.", answer: "I shipped a checkout rewrite." }, handler);

  assert.equal(generated.provider, "fallback");
  assert.ok(deltas.length > 1);
  assert.deepEqual(replacements, []);
  assert.equal(deltas.join(""), FALLBACK_QUESTION);
});

test("a database blip during the post-stream write is retried instead of failing the candidate", async () => {
  const prisma = createPrisma({ transactionFailures: 2 });
  const body = sseFrames(deltaFrame("How did"), deltaFrame(" you measure it?"), "[DONE]");
  const provider = new DeepSeekAiProvider(
    { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash", apiKey: "test-key" },
    streamingFetch(byteChunks(body, 9)),
  );
  const service = new CandidateAiService(prisma.client as any, {} as any, provider);
  const { deltas, handler } = createHandler();

  const generated = await service.followUpStream("ACCESS-1", { question: "Describe a project.", answer: "I shipped a checkout rewrite." }, handler);

  assert.equal(generated.question, "How did you measure it?");
  assert.equal(prisma.state.transactionAttempts, 3);
  assert.equal(deltas.join(""), "How did you measure it?");
  // Retried rows must be written exactly once, not once per attempt.
  assert.equal(prisma.messages.filter((message) => message.role === "assistant").length, 1);
  assert.equal(prisma.messages.filter((message) => message.role === "candidate").length, 1);
});

test("a question that cannot be stored fails the stream instead of being left answerable", async () => {
  const prisma = createPrisma({ transactionFailures: 99 });
  const body = sseFrames(deltaFrame("How did"), deltaFrame(" you measure it?"), "[DONE]");
  const provider = new DeepSeekAiProvider(
    { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash", apiKey: "test-key" },
    streamingFetch(byteChunks(body, 9)),
  );
  const service = new CandidateAiService(prisma.client as any, {} as any, provider);
  const { deltas, handler } = createHandler();

  await assert.rejects(
    () => service.followUpStream("ACCESS-1", { question: "Describe a project.", answer: "I shipped a checkout rewrite." }, handler),
    /could not save this question/i,
  );

  // The candidate saw the question, so the caller has to withdraw it: nothing was
  // stored, and no done frame is written for a question with no row behind it.
  assert.equal(deltas.join(""), "How did you measure it?");
  assert.equal(prisma.messages.length, 0);
  assert.equal(prisma.state.transactionAttempts, 3);
});
