import { Injectable } from "@nestjs/common";
import type {
  GeneratedTemplateDraft,
  GeneratedTemplateDraftRefinement,
  TemplateDraftGenerationInput,
  TemplateDraftRefinementInput,
} from "../templates/drafts/template-draft.types";
import {
  evaluateResponse as deterministicEvaluateResponse,
  generateCandidateReport as deterministicGenerateCandidateReport,
  getModuleEvaluationProfile,
  type EvaluateResponseInput,
  type EvaluationResultDto,
  type GenerateCandidateReportInput,
  type GeneratedCandidateReport,
} from "./evaluation.service";

export interface InterviewQuestionInput {
  roleType?: string;
  templateTitle?: string;
  moduleTitle?: string;
  conversationHistory?: string[];
  rubric?: string[];
}

export interface GeneratedInterviewQuestion {
  question: string;
  rubric: string[];
  provider: "deepseek" | "fallback";
}

export interface FollowUpInput {
  question?: string;
  answer?: string;
  rubric?: string[];
}

export interface GeneratedFollowUp {
  shouldAsk: boolean;
  question: string;
  basedOn: "candidate_answer" | "default_follow_up";
  provider: "deepseek" | "fallback";
}

export interface CodeSubmissionEvaluationInput {
  moduleId?: string;
  moduleTitle?: string;
  sourceCode: string;
  language: string;
  problem: string;
  executionResult?: string;
  rubric?: string[];
  weight?: number;
}

export interface TemplateDraftProposal {
  /** Absent when no provider is configured or the call failed; the caller then
   *  falls back to a prebuilt blueprint rather than showing the user nothing. */
  proposal?: GeneratedTemplateDraft;
  provider: "deepseek" | "fallback";
}

export interface TemplateDraftRefinement {
  /** Absent when the provider failed or deliberately declined the request. */
  proposal?: GeneratedTemplateDraft;
  reply?: string;
  /** False when the model answered but left the draft as it was. */
  changed?: boolean;
  provider: "deepseek" | "fallback";
}

export interface AiProviderClient {
  generateInterviewQuestion?(input: InterviewQuestionInput): Promise<Partial<GeneratedInterviewQuestion>>;
  generateFollowUp?(input: FollowUpInput): Promise<Partial<GeneratedFollowUp>>;
  generateTemplateDraft?(input: TemplateDraftGenerationInput): Promise<Partial<GeneratedTemplateDraft>>;
  refineTemplateDraft?(input: TemplateDraftRefinementInput): Promise<GeneratedTemplateDraftRefinement>;
  evaluateResponse(input: EvaluateResponseInput): Promise<Partial<EvaluationResultDto>>;
  evaluateCodeSubmission?(input: CodeSubmissionEvaluationInput): Promise<Partial<EvaluationResultDto>>;
}

const RESPONSE_ADVISORY_NOTICE = "This AI feedback is advisory and must be reviewed by a human interviewer.";

@Injectable()
export class AiService {
  constructor(private readonly provider?: AiProviderClient) {}

  async generateInterviewQuestion(input: InterviewQuestionInput): Promise<GeneratedInterviewQuestion> {
    const fallback = fallbackInterviewQuestion(input);
    if (!this.provider?.generateInterviewQuestion) return fallback;

    try {
      const generated = await this.provider.generateInterviewQuestion(input);
      return {
        question: nonEmpty(generated.question, fallback.question),
        rubric: nonEmptyArray(generated.rubric, fallback.rubric),
        provider: "deepseek",
      };
    } catch {
      return fallback;
    }
  }

  async generateFollowUp(input: FollowUpInput): Promise<GeneratedFollowUp> {
    const fallback = deterministicFollowUpDecision(input);
    if (!this.provider?.generateFollowUp) return fallback;

    try {
      const generated = await this.provider.generateFollowUp(input);
      const question = generated.question?.trim() ?? "";
      // Providers written against the previous contract returned only a question.
      // Keep those adapters compatible while the first-party provider sends the
      // explicit decision.
      const shouldAsk = (generated.shouldAsk === true || (generated.shouldAsk === undefined && Boolean(question))) && Boolean(question);
      return {
        shouldAsk,
        question: shouldAsk ? question : "",
        basedOn: input.answer ? "candidate_answer" : "default_follow_up",
        provider: "deepseek",
      };
    } catch {
      return fallback;
    }
  }

  /**
   * Propose an assessment template from a job description or a written idea.
   *
   * Unlike the evaluation calls, there is no deterministic substitute worth
   * inventing here, so a missing or failing provider returns no proposal at all
   * and the caller supplies a prebuilt blueprint instead. Nothing this returns is
   * trusted: the proposal is validated and re-weighted before it becomes a draft.
   */
  async generateTemplateDraft(input: TemplateDraftGenerationInput): Promise<TemplateDraftProposal> {
    if (!this.provider?.generateTemplateDraft) return { provider: "fallback" };

    try {
      const proposal = await this.provider.generateTemplateDraft(input);
      if (!proposal || !Array.isArray(proposal.modules) || proposal.modules.length === 0) {
        return { provider: "fallback" };
      }
      return { proposal, provider: "deepseek" };
    } catch {
      return { provider: "fallback" };
    }
  }

  /**
   * Revise an existing draft according to one reviewer chat instruction.
   *
   * Same posture as generateTemplateDraft: there is no deterministic substitute
   * for a conversational edit, so a missing or failing provider returns no
   * proposal and the caller tells the reviewer the assistant is unavailable
   * rather than guessing at a change.
   */
  async refineTemplateDraft(input: TemplateDraftRefinementInput): Promise<TemplateDraftRefinement> {
    if (!this.provider?.refineTemplateDraft) return { provider: "fallback" };

    try {
      const generated = await this.provider.refineTemplateDraft(input);
      const draft = generated?.draft;
      if (!draft || !Array.isArray(draft.modules) || draft.modules.length === 0) {
        // The model answered without a usable draft — a polite refusal or a
        // malformed revision. Either way the stored draft must not change.
        return { reply: generated?.reply, changed: false, provider: "deepseek" };
      }
      return { proposal: draft, reply: generated.reply, changed: generated.changed !== false, provider: "deepseek" };
    } catch {
      return { provider: "fallback" };
    }
  }

  async evaluateResponse(input: EvaluateResponseInput): Promise<EvaluationResultDto> {
    const normalizedInput = withModuleDefaults(input);
    const fallback = deterministicEvaluateResponse(normalizedInput);
    if (!normalizedInput.responseText.trim()) return fallback;
    if (!this.provider) return fallback;

    try {
      const providerResult = await this.provider.evaluateResponse(normalizedInput);
      return mergeEvaluation(fallback, providerResult, normalizedInput.objectiveScore, normalizedInput.responseText);
    } catch {
      return {
        ...fallback,
        feedback: `${fallback.feedback} AI provider unavailable; fallback rubric evaluation used.`,
      };
    }
  }

  async evaluateCodeSubmission(input: CodeSubmissionEvaluationInput): Promise<EvaluationResultDto> {
    const codingProfile = getModuleEvaluationProfile("coding");
    const fallbackInput: EvaluateResponseInput = {
      moduleId: input.moduleId,
      moduleTitle: input.moduleTitle ?? codingProfile.title,
      moduleType: "coding",
      // The problem statement is the challenge author's wording, so it stays out of
      // the scored text; only the submission and its execution result are candidate work.
      responseText: [
        `Language: ${input.language}`,
        `Source code: ${input.sourceCode}`,
        input.executionResult ? `Execution result: ${input.executionResult}` : "Execution result: not provided",
      ].join("\n\n"),
      questionContext: [`Problem: ${input.problem}`],
      rubric: input.rubric?.length ? input.rubric : codingProfile.rubric,
      weight: input.weight,
    };

    const fallback = deterministicEvaluateResponse(fallbackInput);
    if (!this.provider?.evaluateCodeSubmission) return this.evaluateResponse(fallbackInput);

    try {
      return mergeEvaluation(
        fallback,
        await this.provider.evaluateCodeSubmission(input),
        fallbackInput.objectiveScore,
        fallbackInput.responseText,
      );
    } catch {
      return {
        ...fallback,
        feedback: `${fallback.feedback} AI provider unavailable; fallback coding rubric evaluation used.`,
      };
    }
  }

  generateCandidateReport(input: GenerateCandidateReportInput): GeneratedCandidateReport {
    return deterministicGenerateCandidateReport(input);
  }
}

function withModuleDefaults(input: EvaluateResponseInput): EvaluateResponseInput {
  const profile = getModuleEvaluationProfile(input.moduleType);
  return {
    ...input,
    moduleTitle: input.moduleTitle ?? profile.title,
    rubric: input.rubric?.length ? input.rubric : profile.rubric,
  };
}

/**
 * The provider is told never to quote questionContext as evidence, but a prompt is
 * a request, not a guarantee. An evidence quote is shown to a reviewer as the
 * candidate's own words, so anything that is not actually in the candidate's text
 * is dropped here rather than trusted. Whitespace is normalised because a model
 * reflows what it quotes; matching is otherwise strict.
 */
function quotesFromCandidateText(quotes: string[], responseText: string): string[] {
  const haystack = responseText.replace(/\s+/g, " ").toLowerCase();
  if (!haystack) return [];
  return quotes.filter((quote) => {
    const needle = quote.replace(/\s+/g, " ").trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

function mergeEvaluation(
  fallback: EvaluationResultDto,
  providerResult: Partial<EvaluationResultDto>,
  objectiveScore?: number,
  candidateText?: string,
): EvaluationResultDto {
  const score = objectiveScore === undefined ? normalizeScore(providerResult.score, fallback.score) : normalizeScore(objectiveScore, fallback.score);
  const providerEvidence = candidateText === undefined
    ? providerResult.evidence
    : quotesFromCandidateText(providerResult.evidence ?? [], candidateText);
  return {
    ...fallback,
    score,
    criteriaScores: normalizeCriteriaScores(providerResult.criteriaScores, fallback.criteriaScores),
    feedback: nonEmpty(providerResult.feedback, fallback.feedback),
    strengths: score > 0 ? nonEmptyArray(providerResult.strengths, fallback.strengths) : [],
    improvementAreas: nonEmptyArray(providerResult.improvementAreas, fallback.improvementAreas),
    evidence: nonEmptyArray(providerEvidence, fallback.evidence),
    advisoryNotice: RESPONSE_ADVISORY_NOTICE,
  };
}

function fallbackInterviewQuestion(input: InterviewQuestionInput): GeneratedInterviewQuestion {
  return {
    question: `Tell me about a project you built for a ${input.roleType ?? "target"} role and the hardest problem you solved.`,
    rubric: input.rubric?.length ? input.rubric : ["clarity", "technical depth", "problem solving", "reflection"],
    provider: "fallback",
  };
}

export function deterministicFollowUpDecision(input: FollowUpInput): GeneratedFollowUp {
  const answer = input.answer?.trim() ?? "";
  const words = answer.match(/\b[\p{L}\p{N}'-]+\b/gu) ?? [];
  const isVague = /^(?:i\s+)?(?:do(?:n't| not)\s+know|not sure|no idea|yes|no|maybe|n\/a|none)[.!?]*$/i.test(answer);
  const hasConcreteDetail = /\d|%|\b(?:because|result|outcome|measured|increased|reduced|improved|delivered|launched|resolved|learned|decided|chose|implemented)\b/i.test(answer);
  const shouldAsk = isVague || words.length < 18 || (words.length < 35 && !hasConcreteDetail);

  if (!shouldAsk) {
    return {
      shouldAsk: false,
      question: "",
      basedOn: input.answer ? "candidate_answer" : "default_follow_up",
      provider: "fallback",
    };
  }

  return {
    shouldAsk: true,
    question: "What trade-off did you consider, and how did you decide between options?",
    basedOn: input.answer ? "candidate_answer" : "default_follow_up",
    provider: "fallback",
  };
}

function normalizeScore(score: number | undefined, fallback: number): number {
  if (typeof score !== "number" || Number.isNaN(score)) return fallback;
  // Floor is 0, not 1 — an empty / non-answer must be able to score 0 (0%) rather
  // than being clamped up to a passing-looking 1/5 (20%).
  return Math.round(Math.min(5, Math.max(0, score)) * 100) / 100;
}

function normalizeCriteriaScores(scores: Record<string, number> | undefined, fallback: Record<string, number>): Record<string, number> {
  if (!scores || typeof scores !== "object") return fallback;
  return Object.fromEntries(Object.entries(scores).map(([criterion, score]) => [criterion, normalizeScore(score, fallback[criterion] ?? 3)]));
}

function nonEmpty(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function nonEmptyArray(values: string[] | undefined, fallback: string[]): string[] {
  const normalized = values?.map((value) => value.trim()).filter(Boolean) ?? [];
  return normalized.length ? normalized : fallback;
}
