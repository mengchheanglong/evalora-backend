import { getAiProviderConfig, type RuntimeEnv } from "../../config/runtime.config";
import type { CodeSubmissionEvaluationInput, GeneratedFollowUp, GeneratedInterviewQuestion, InterviewQuestionInput, FollowUpInput } from "./ai.service";
import { getModuleEvaluationProfile, type EvaluateResponseInput, type EvaluationResultDto } from "./evaluation.service";

export interface DeepSeekProviderConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

interface DeepSeekChoice {
  message?: {
    content?: string;
  };
}

interface DeepSeekCompletionResponse {
  choices?: DeepSeekChoice[];
}

interface DeepSeekFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text?(): Promise<string>;
}

export type DeepSeekFetch = (url: string, init: RequestInit) => Promise<DeepSeekFetchResponse>;

const DEFAULT_TIMEOUT_MS = 20_000;

export class DeepSeekAiProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey?: string;

  constructor(config: DeepSeekProviderConfig, private readonly fetchImpl: DeepSeekFetch = defaultFetch) {
    this.baseUrl = trimTrailingSlash(config.baseUrl);
    this.model = config.model;
    this.apiKey = config.apiKey?.trim();
  }

  async generateInterviewQuestion(input: InterviewQuestionInput): Promise<Partial<GeneratedInterviewQuestion>> {
    return this.chatJson("Generate one interview question for Evalora.", {
      outputShape: { question: "string", rubric: ["criterion"] },
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
              "You are Evalora's assessment evaluator. Return only valid JSON. Use only rubric and candidate evidence. Do not make final hiring decisions. Do not provide medical or mental-health diagnosis.",
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
    weight: input.weight,
  };
}

function evaluationOutputShape(rubric: string[]) {
  return {
    score: "number from 1 to 5",
    criteriaScores: Object.fromEntries(rubric.map((criterion) => [criterion, "number from 1 to 5"])),
    feedback: "short evidence-based written feedback",
    strengths: ["strength"],
    improvementAreas: ["improvement area"],
    evidence: ["short quote or evidence from response"],
  };
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
