import { getAiProviderConfig, type RuntimeEnv } from "../../config/runtime.config";
import type { CodeSubmissionEvaluationInput, GeneratedFollowUp, GeneratedInterviewQuestion, InterviewQuestionInput, FollowUpInput } from "./ai.service";
import { getModuleEvaluationProfile, type EvaluateResponseInput, type EvaluationResultDto } from "./evaluation.service";

export interface DeepSeekProviderConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** Overridable so tests can exercise the stream deadlines without real waiting. */
  streamFirstTokenTimeoutMs?: number;
  streamTotalBudgetMs?: number;
}

interface DeepSeekChoice {
  message?: {
    content?: string;
  };
}

interface DeepSeekCompletionResponse {
  choices?: DeepSeekChoice[];
}

interface DeepSeekStreamChoice {
  delta?: {
    content?: string;
  };
}

interface DeepSeekStreamEvent {
  choices?: DeepSeekStreamChoice[];
}

export interface DeepSeekStreamChunk {
  done: boolean;
  value?: Uint8Array | string;
}

export interface DeepSeekStreamReader {
  read(): Promise<DeepSeekStreamChunk>;
  cancel?(): unknown;
}

export interface DeepSeekStreamBody {
  getReader(): DeepSeekStreamReader;
}

interface DeepSeekFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text?(): Promise<string>;
  body?: DeepSeekStreamBody | null;
}

export type DeepSeekFetch = (url: string, init: RequestInit) => Promise<DeepSeekFetchResponse>;

export type DeepSeekDeltaHandler = (text: string) => void;

export interface DeepSeekStreamResult {
  text: string;
  /** True when a deadline or a broken socket ended the read, so `text` may stop
   *  mid-sentence and the caller must decide whether it is still usable. */
  truncated: boolean;
}

interface StreamDeadlines {
  firstTokenAt: number;
  totalAt: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;
// A streamed answer is slow on purpose, so the two failure modes get separate budgets.
// An upstream that never starts writing has to fail fast, while a healthy model writing
// a long answer must be allowed to finish: one whole-body timeout cut working answers
// off mid-sentence and left a dangling clause on the candidate's screen.
const STREAM_FIRST_TOKEN_TIMEOUT_MS = 20_000;
const STREAM_TOTAL_BUDGET_MS = 120_000;
// The socket abort trails the read deadline so the reader reports the timeout itself
// and keeps the tokens it already collected, instead of racing an AbortError.
const STREAM_ABORT_GRACE_MS = 1_000;
const MAX_STREAMED_CHARACTERS = 4_000;
// A sentinel, not a string: any literal marker could collide with a real token.
const STREAM_DONE = Symbol("deepseek-stream-done");
const STREAM_TIMED_OUT = Symbol("deepseek-stream-timed-out");
const STREAM_SYSTEM_PROMPT =
  "You are Evalora's interview assistant. Reply with plain text only: one concise question, with no JSON, no markdown, no quotes, and no preamble. Use only the candidate's answer as evidence. Do not score the candidate, reveal evaluation criteria, or make hiring decisions.";

export class DeepSeekAiProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey?: string;
  private readonly firstTokenTimeoutMs: number;
  private readonly totalBudgetMs: number;

  constructor(config: DeepSeekProviderConfig, private readonly fetchImpl: DeepSeekFetch = defaultFetch) {
    this.baseUrl = trimTrailingSlash(config.baseUrl);
    this.model = config.model;
    this.apiKey = config.apiKey?.trim();
    this.firstTokenTimeoutMs = config.streamFirstTokenTimeoutMs ?? STREAM_FIRST_TOKEN_TIMEOUT_MS;
    this.totalBudgetMs = config.streamTotalBudgetMs ?? STREAM_TOTAL_BUDGET_MS;
  }

  async generateInterviewQuestion(input: InterviewQuestionInput): Promise<Partial<GeneratedInterviewQuestion>> {
    return this.chatJson("Generate one interview question for Evalora.", {
      outputShape: { question: "string", rubric: ["criterion"] },
      instructions:
        "Use the complete conversation history to identify an important gap, unclear claim, or role-relevant area worth probing. Ask one concise question that is not already present in an 'Already asked' entry. Do not score the candidate or reveal evaluation criteria.",
      roleType: input.roleType,
      templateTitle: input.templateTitle,
      moduleTitle: input.moduleTitle,
      conversationHistory: input.conversationHistory ?? [],
      rubric: input.rubric ?? [],
    });
  }

  async generateFollowUp(input: FollowUpInput): Promise<Partial<GeneratedFollowUp>> {
    return this.chatJson("Generate one concise follow-up interview question for Evalora.", {
      outputShape: { question: "string" },
      originalQuestion: input.question,
      candidateAnswer: input.answer,
      rubric: input.rubric ?? [],
    });
  }

  /** Streams a follow-up question so the candidate sees it written token by token. */
  async streamFollowUp(input: FollowUpInput, onDelta: DeepSeekDeltaHandler): Promise<DeepSeekStreamResult> {
    return this.streamChat(
      "Generate one concise follow-up interview question for Evalora.",
      {
        originalQuestion: input.question,
        candidateAnswer: input.answer,
        rubric: input.rubric ?? [],
      },
      onDelta,
    );
  }

  async streamChat(task: string, payload: unknown, onDelta: DeepSeekDeltaHandler): Promise<DeepSeekStreamResult> {
    if (!this.apiKey) throw new Error("DeepSeek API key is not configured.");

    const startedAt = Date.now();
    const controller = new AbortController();
    // Connecting is the only phase that must fail fast, so the short budget covers the
    // request up to the response headers and is cancelled the moment they arrive.
    let connectTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => controller.abort(), this.firstTokenTimeoutMs);
    let socketTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          stream: true,
          messages: [
            { role: "system", content: STREAM_SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify({ task, payload }) },
          ],
        }),
        signal: controller.signal,
      });
      clearTimeout(connectTimer);
      connectTimer = undefined;

      if (!response.ok) {
        const body = response.text ? await response.text() : "";
        throw new Error(`DeepSeek stream request failed with status ${response.status}: ${body.slice(0, 160)}`);
      }
      if (!response.body) throw new Error("DeepSeek stream response did not include a body.");

      const totalAt = startedAt + this.totalBudgetMs;
      socketTimer = setTimeout(() => controller.abort(), Math.max(0, totalAt + STREAM_ABORT_GRACE_MS - Date.now()));
      return await readDeltaStream(response.body, onDelta, { firstTokenAt: Date.now() + this.firstTokenTimeoutMs, totalAt });
    } finally {
      if (connectTimer) clearTimeout(connectTimer);
      if (socketTimer) clearTimeout(socketTimer);
    }
  }

  async evaluateResponse(input: EvaluateResponseInput): Promise<Partial<EvaluationResultDto>> {
    return this.chatJson("Evaluate one candidate assessment response for Evalora.", evaluationPayload(input));
  }

  async evaluateCodeSubmission(input: CodeSubmissionEvaluationInput): Promise<Partial<EvaluationResultDto>> {
    const codingProfile = getModuleEvaluationProfile("coding");
    const rubric = input.rubric?.length ? input.rubric : codingProfile.rubric;
    return this.chatJson("Evaluate one coding assessment submission for Evalora using the execution result as evidence.", {
      outputShape: evaluationOutputShape(rubric),
      moduleType: "coding",
      moduleTitle: input.moduleTitle ?? codingProfile.title,
      problem: input.problem,
      language: input.language,
      sourceCode: input.sourceCode,
      executionResult: input.executionResult ?? "not provided",
      rubric,
      focusAreas: codingProfile.focusAreas,
      safetyGuidance: codingProfile.safetyGuidance,
    });
  }

  private async chatJson<T>(task: string, payload: unknown): Promise<T> {
    if (!this.apiKey) throw new Error("DeepSeek API key is not configured.");

    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are Evalora's assessment evaluator. Return only valid JSON. Use only the candidate's answer as evidence; question text is context, never evidence. Evaluate every rubric criterion, then use only these overall score anchors with no participation or attempt floor: 0 when there is no valid evidence or the work is blank, irrelevant, unsupported, or factually wrong; 1.25 when only one criterion or limited valid evidence is supported; 2.5 when about half the criteria are supported or material gaps remain; 4 when all or nearly all criteria have strong evidence with only a minor gap; 5 when every criterion has complete, concrete, and correct evidence. Do not make final hiring decisions. Do not provide medical or mental-health diagnosis.",
          },
          {
            role: "user",
            content: JSON.stringify({ task, payload }),
          },
        ],
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = response.text ? await response.text() : "";
      throw new Error(`DeepSeek request failed with status ${response.status}: ${body.slice(0, 160)}`);
    }

    const data = (await response.json()) as DeepSeekCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek response did not include message content.");
    return parseJsonObject<T>(content);
  }
}

export function createDeepSeekProviderFromEnv(env: RuntimeEnv = process.env): DeepSeekAiProvider {
  const config = getAiProviderConfig(env);
  return new DeepSeekAiProvider({ baseUrl: config.baseUrl, model: config.model, apiKey: env.DEEPSEEK_API_KEY });
}

function evaluationPayload(input: EvaluateResponseInput) {
  const profile = getModuleEvaluationProfile(input.moduleType);
  const rubric = input.rubric?.length ? input.rubric : profile.rubric;
  return {
    outputShape: evaluationOutputShape(rubric),
    moduleId: input.moduleId,
    moduleTitle: input.moduleTitle ?? profile.title,
    moduleType: input.moduleType,
    responseText: input.responseText,
    rubric,
    focusAreas: profile.focusAreas,
    safetyGuidance: profile.safetyGuidance,
    scoringGuide: {
      "0": "Blank, irrelevant, unsupported, or factually wrong; no valid rubric evidence.",
      "1.25": "Only one criterion or limited valid evidence is supported (25%).",
      "2.5": "About half the criteria are supported or material gaps remain (50%).",
      "4": "All or nearly all criteria have strong evidence with only a minor gap (80%).",
      "5": "Every criterion has complete, concrete, and correct evidence (100%).",
    },
    weight: input.weight,
  };
}

function evaluationOutputShape(rubric: string[]) {
  return {
    score: "one of 0, 1.25, 2.5, 4, or 5; use 0 when no valid evidence exists",
    criteriaScores: Object.fromEntries(rubric.map((criterion) => [criterion, "number from 0 to 5"])),
    feedback: "short evidence-based written feedback",
    strengths: ["strength"],
    improvementAreas: ["improvement area"],
    evidence: ["short quote or evidence from response"],
  };
}

async function readDeltaStream(body: DeepSeekStreamBody, onDelta: DeepSeekDeltaHandler, deadlines: StreamDeadlines): Promise<DeepSeekStreamResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let finished = false;
  let truncated = false;

  try {
    while (!finished) {
      // Silence before the first token means a stuck upstream and is given the short
      // budget; once tokens are flowing the model only has to finish inside the long one.
      const deadline = content ? deadlines.totalAt : Math.min(deadlines.firstTokenAt, deadlines.totalAt);
      const chunk = await readWithDeadline(reader, deadline);
      if (chunk === STREAM_TIMED_OUT) {
        truncated = true;
        break;
      }
      if (chunk.done) break;
      buffer += decodeStreamValue(decoder, chunk.value);

      // A network read can end in the middle of an SSE line, so only whole lines are
      // parsed here and the trailing partial line stays buffered for the next read.
      let breakIndex = buffer.indexOf("\n");
      while (breakIndex !== -1) {
        const line = buffer.slice(0, breakIndex);
        buffer = buffer.slice(breakIndex + 1);
        const event = parseStreamLine(line);
        if (event === STREAM_DONE) {
          finished = true;
          break;
        }
        if (event) {
          content += event;
          onDelta(event);
        }
        if (content.length >= MAX_STREAMED_CHARACTERS) {
          finished = true;
          truncated = true;
          break;
        }
        breakIndex = buffer.indexOf("\n");
      }
    }

    if (!finished && !truncated) {
      const trailing = parseStreamLine(buffer);
      if (trailing && trailing !== STREAM_DONE) {
        content += trailing;
        onDelta(trailing);
      }
    }
  } catch (error) {
    // Tokens already handed to the caller are on the candidate's screen, so a socket
    // that breaks mid-answer returns what arrived. Only a stream that produced nothing
    // is still a clean provider failure the caller can substitute wholesale.
    if (!content) throw error;
    truncated = true;
  } finally {
    await reader.cancel?.();
  }

  return { text: content, truncated };
}

/** Resolves with the next chunk, or with the timeout sentinel when `deadline` passes
 *  first, so an overdue read ends the stream without discarding earlier tokens. */
async function readWithDeadline(reader: DeepSeekStreamReader, deadline: number): Promise<DeepSeekStreamChunk | typeof STREAM_TIMED_OUT> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return STREAM_TIMED_OUT;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<typeof STREAM_TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(STREAM_TIMED_OUT), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseStreamLine(line: string): string | typeof STREAM_DONE | undefined {
  const normalized = line.trim();
  if (!normalized || !normalized.startsWith("data:")) return undefined;

  const payload = normalized.slice(5).trim();
  if (!payload) return undefined;
  if (payload === "[DONE]") return STREAM_DONE;

  try {
    const event = JSON.parse(payload) as DeepSeekStreamEvent;
    return event.choices?.[0]?.delta?.content || undefined;
  } catch {
    // Keep-alive and non-JSON frames are not fatal; dropping them keeps the stream alive.
    return undefined;
  }
}

function decodeStreamValue(decoder: TextDecoder, value: Uint8Array | string | undefined): string {
  if (value === undefined) return "";
  return typeof value === "string" ? value : decoder.decode(value, { stream: true });
}

function parseJsonObject<T>(content: string): T {
  try {
    return JSON.parse(content) as T;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("DeepSeek response was not JSON.");
    return JSON.parse(match[0]) as T;
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

const defaultFetch: DeepSeekFetch = async (url, init) => fetch(url, init);
