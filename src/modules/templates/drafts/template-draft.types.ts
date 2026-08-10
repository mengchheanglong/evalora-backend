import type { JsonValue, ModuleType, QuestionType } from "../../../domain/evalora.types";

/**
 * How important a module is, rated 1-5 by the generator. The model rates; it never
 * sets a percentage. Converting these ratings into weights that sum to 100 is the
 * backend's job (see `weighting.ts`), so a model that returns nonsense percentages,
 * or none at all, cannot skew a published assessment.
 */
export interface DraftWeightSignals {
  /** How central the skill is to the target role. */
  roleImportance: number;
  /** How much damage a weak hire in this area would do on the job. */
  riskIfWeak: number;
  /** How much scorable evidence the module actually collects. */
  evidenceVolume: number;
  /** How demanding the module is for the candidate. */
  difficulty: number;
  /** Essential to the role, versus supplementary nice-to-have. */
  essential: boolean;
}

export interface DraftQuestion {
  /** Stable client-side handle. Draft questions have no database id yet. */
  key: string;
  questionText: string;
  questionType: QuestionType;
  /** Choices for `mcq` questions; absent for every other type. */
  options?: string[];
  rubric: string[];
}

export interface DraftModule {
  key: string;
  type: ModuleType;
  title: string;
  description: string;
  orderIndex: number;
  /** Positive integer share of 100. Computed here, never taken from the model. */
  weight: number;
  /** Plain-language reason for this module's share, shown next to it in review. */
  weightRationale: string;
  weightSignals: DraftWeightSignals;
  settings?: JsonValue;
  questions: DraftQuestion[];
}

export interface TemplateDraft {
  title: string;
  description: string;
  roleType: string;
  timeLimitMin: number;
  modules: DraftModule[];
  /**
   * What validation changed on the way in — dropped modules, clamped limits,
   * rebalanced weights. Surfaced to the reviewer so silent edits stay visible.
   */
  warnings: string[];
}

export type TemplateDraftStatus = "draft" | "published" | "discarded";
export type TemplateDraftSource = "document" | "prompt";
export type TemplateDraftProvider = "deepseek" | "fallback";

export interface TemplateDraftDto {
  id: string;
  status: TemplateDraftStatus;
  source: TemplateDraftSource;
  sourceFileName?: string;
  provider: TemplateDraftProvider;
  draft: TemplateDraft;
  /** The untouched AI proposal, for comparison against the edited draft. */
  aiProposal: TemplateDraft;
  publishedTemplateId?: string;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TemplateDraftSummaryDto {
  id: string;
  status: TemplateDraftStatus;
  source: TemplateDraftSource;
  sourceFileName?: string;
  provider: TemplateDraftProvider;
  title: string;
  roleType: string;
  moduleCount: number;
  questionCount: number;
  publishedTemplateId?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** What the generator is asked to produce a draft from. */
export interface TemplateDraftGenerationInput {
  /** Sanitized document text, when the user uploaded a file. */
  sourceText?: string;
  /** Free-text description, when the user typed their idea instead. */
  idea?: string;
  /** Optional role hint from the request form. */
  roleType?: string;
}

/** The model's raw proposal shape, before validation. Every field is optional
 *  because none of it is trusted until `normalizeDraft` has run. */
export interface GeneratedTemplateDraft {
  title?: string;
  description?: string;
  roleType?: string;
  timeLimitMin?: number;
  modules?: Array<{
    type?: string;
    title?: string;
    description?: string;
    weightRationale?: string;
    weightSignals?: Partial<DraftWeightSignals>;
    questions?: Array<{
      questionText?: string;
      questionType?: string;
      options?: unknown;
      rubric?: unknown;
    }>;
  }>;
}

export interface GeneratedTemplateDraftResult {
  draft: TemplateDraft;
  provider: TemplateDraftProvider;
}
