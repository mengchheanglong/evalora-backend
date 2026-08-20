import type { JsonValue, ModuleType, QuestionType } from "../../../domain/evalora.types";
import { getModuleEvaluationProfile } from "../../ai/evaluation.service";
import {
  DEFAULT_TIME_LIMIT_MIN,
  MAX_DESCRIPTION_LENGTH,
  MAX_MODULES,
  MAX_OPTION_LENGTH,
  MAX_OPTIONS,
  MAX_QUESTION_LENGTH,
  MAX_QUESTIONS_PER_MODULE,
  MAX_RATIONALE_LENGTH,
  MAX_RUBRIC_CRITERIA,
  MAX_RUBRIC_CRITERION_LENGTH,
  MAX_TIME_LIMIT_MIN,
  MAX_TITLE_LENGTH,
  MAX_WARNINGS,
  MIN_TIME_LIMIT_MIN,
} from "./draft.constants";
import type { DraftModule, DraftQuestion, DraftWeightSignals, TemplateDraft } from "./template-draft.types";
import { normalizeSignals, normalizeWeights } from "./weighting";

/**
 * The validation boundary for draft content.
 *
 * Everything that reaches a draft is untrusted: model output shaped by whatever
 * text was inside an uploaded document, or a JSON body typed by a client. Both
 * go through this file, so there is exactly one place where "what a draft may
 * contain" is decided, and a hand-edited draft cannot smuggle in a shape the
 * generated one could not.
 *
 * Nothing here throws. Bad content is dropped or clamped and reported in
 * `warnings`, because a reviewer who can see what changed can fix it; an
 * exception mid-generation just loses the work.
 */

const MODULE_TYPES: ModuleType[] = [
  "ai_interview",
  "coding",
  "debugging",
  "work_style",
  "behavioral",
  "leadership",
  "communication",
  "problem_solving",
];

const QUESTION_TYPES: QuestionType[] = ["mcq", "scale", "short_answer", "coding", "scenario", "roleplay"];

/**
 * Control characters, zero-width characters, and bidirectional overrides. These
 * carry no meaning in a question or a title, and they are exactly what is used to
 * hide text from a human reviewer while leaving it visible to a model.
 */
// eslint-disable-next-line no-control-regex
const INVISIBLE_CHARACTERS = new RegExp("[\\u0000-\\u0008\\u000B-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]", "g");

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;

export interface NormalizeDraftContext {
  /** Role hint from the request, used when the payload does not name one. */
  roleType?: string;
}

export function normalizeDraft(input: unknown, context: NormalizeDraftContext = {}): TemplateDraft {
  const warnings: string[] = [];
  const record = asRecord(input);

  const roleType = singleLine(record.roleType, MAX_TITLE_LENGTH) || singleLine(context.roleType, MAX_TITLE_LENGTH) || "General";
  const title = singleLine(record.title, MAX_TITLE_LENGTH) || `${roleType} Assessment`;
  const modules = normalizeModules(record.modules, warnings);

  const draft: TemplateDraft = {
    title,
    description: multiLine(record.description, MAX_DESCRIPTION_LENGTH),
    roleType,
    timeLimitMin: clampInt(record.timeLimitMin, MIN_TIME_LIMIT_MIN, MAX_TIME_LIMIT_MIN, DEFAULT_TIME_LIMIT_MIN),
    modules,
    warnings: [],
  };

  applyWeights(draft, asArray(record.modules), warnings);
  draft.warnings = mergeWarnings(record.warnings, warnings);
  return draft;
}

/** Weights are always recomputed, so no stored draft can drift off the 100 total. */
function applyWeights(draft: TemplateDraft, rawModules: unknown[], warnings: string[]): void {
  // Manual weights survive re-normalization as relative intent. They are read from
  // the raw payload by module key so a dropped module cannot shift the alignment.
  const overrides = draft.modules.map((module) => {
    const raw = rawModules.find((candidate) => asRecord(candidate).key === module.key);
    const weight = asRecord(raw).weight;
    return typeof weight === "number" && Number.isFinite(weight) && weight > 0 ? weight : undefined;
  });

  const { weights, warnings: weightWarnings } = normalizeWeights(draft.modules, overrides);
  draft.modules.forEach((module, index) => {
    module.weight = weights[index] ?? 0;
  });
  warnings.push(...weightWarnings);
}

function normalizeModules(input: unknown, warnings: string[]): DraftModule[] {
  const raw = asArray(input);
  if (raw.length > MAX_MODULES) {
    warnings.push(`Only the first ${MAX_MODULES} modules were kept; ${raw.length - MAX_MODULES} more were dropped.`);
  }

  const usedKeys = new Set<string>();
  const modules: DraftModule[] = [];

  for (const entry of raw.slice(0, MAX_MODULES)) {
    const record = asRecord(entry);
    const type = toModuleType(record.type);
    if (!type) {
      warnings.push(`A module was dropped because "${describe(record.type)}" is not a supported module type.`);
      continue;
    }

    const profile = getModuleEvaluationProfile(type);
    const title = singleLine(record.title, MAX_TITLE_LENGTH) || profile.title;
    const orderIndex = modules.length + 1;
    const key = takeKey(record.key, `module-${orderIndex}`, usedKeys);

    modules.push({
      key,
      type,
      title,
      description: multiLine(record.description, MAX_DESCRIPTION_LENGTH),
      orderIndex,
      // Replaced by applyWeights; never trusted from the payload.
      weight: 0,
      weightRationale: multiLine(record.weightRationale, MAX_RATIONALE_LENGTH) || defaultRationale(title),
      weightSignals: normalizeSignals(asRecord(record.weightSignals) as Partial<DraftWeightSignals>),
      settings: normalizeSettings(record.settings),
      questions: normalizeQuestions(record.questions, type, key, profile.rubric, warnings),
    });
  }

  return modules;
}

function normalizeQuestions(
  input: unknown,
  moduleType: ModuleType,
  moduleKey: string,
  defaultRubric: string[],
  warnings: string[],
): DraftQuestion[] {
  const raw = asArray(input);

  // AI interview openings are generated during the session from earlier evidence,
  // so authored questions there are discarded at the template write boundary
  // (see templates.service.ts). Dropping them here keeps the draft honest about
  // what will actually be created.
  if (moduleType === "ai_interview") {
    if (raw.length > 0) {
      warnings.push("AI interview questions are generated live during the session, so the suggested ones were removed.");
    }
    return [];
  }

  if (raw.length > MAX_QUESTIONS_PER_MODULE) {
    warnings.push(
      `A module kept only its first ${MAX_QUESTIONS_PER_MODULE} questions; ${raw.length - MAX_QUESTIONS_PER_MODULE} more were dropped.`,
    );
  }

  const usedKeys = new Set<string>();
  const questions: DraftQuestion[] = [];

  for (const entry of raw.slice(0, MAX_QUESTIONS_PER_MODULE)) {
    const record = asRecord(entry);
    const questionText = multiLine(record.questionText, MAX_QUESTION_LENGTH);
    if (!questionText) continue;

    const options = normalizeOptions(record.options);
    let questionType = toQuestionType(record.questionType) ?? defaultQuestionType(moduleType);
    // An MCQ with nothing to choose from is unanswerable, so it becomes the
    // open-ended question it effectively already is.
    if (questionType === "mcq" && options.length < 2) {
      warnings.push(`"${truncate(questionText, 60)}" had no answer choices, so it was changed to a short answer question.`);
      questionType = "short_answer";
    }

    const position = questions.length + 1;
    questions.push({
      key: takeKey(record.key, `${moduleKey}-question-${position}`, usedKeys),
      questionText,
      questionType,
      ...(questionType === "mcq" ? { options } : {}),
      rubric: normalizeRubric(record.rubric, defaultRubric),
    });
  }

  return questions;
}

function normalizeRubric(input: unknown, defaultRubric: string[]): string[] {
  const criteria = unique(
    asArray(input)
      .map((entry) => singleLine(entry, MAX_RUBRIC_CRITERION_LENGTH))
      .filter(Boolean),
  ).slice(0, MAX_RUBRIC_CRITERIA);

  // A question with no rubric cannot be scored consistently, so it inherits the
  // module's researched default rather than shipping empty.
  return criteria.length > 0 ? criteria : defaultRubric.slice(0, MAX_RUBRIC_CRITERIA);
}

function normalizeOptions(input: unknown): string[] {
  return unique(
    asArray(input)
      .map((entry) => singleLine(entry, MAX_OPTION_LENGTH))
      .filter(Boolean),
  ).slice(0, MAX_OPTIONS);
}

/** Only plain JSON objects survive; arrays and scalars are not valid module settings. */
function normalizeSettings(input: unknown): JsonValue | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const entries = Object.entries(input as Record<string, unknown>).filter(([, value]) => isPlainJsonValue(value));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function isPlainJsonValue(value: unknown): boolean {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function mergeWarnings(existing: unknown, added: string[]): string[] {
  const carried = asArray(existing)
    .map((entry) => singleLine(entry, MAX_DESCRIPTION_LENGTH))
    .filter(Boolean);
  return unique([...carried, ...added]).slice(0, MAX_WARNINGS);
}

function defaultQuestionType(moduleType: ModuleType): QuestionType {
  if (moduleType === "coding" || moduleType === "debugging") return "coding";
  if (moduleType === "leadership" || moduleType === "problem_solving") return "scenario";
  if (moduleType === "communication") return "roleplay";
  return "short_answer";
}

function defaultRationale(title: string): string {
  return `${title} was weighted from its role importance, risk if weak, evidence collected, and difficulty.`;
}

function toModuleType(value: unknown): ModuleType | undefined {
  const normalized = enumCandidate(value);
  return MODULE_TYPES.find((type) => type === normalized);
}

function toQuestionType(value: unknown): QuestionType | undefined {
  const normalized = enumCandidate(value);
  return QUESTION_TYPES.find((type) => type === normalized);
}

/** Accepts `AI_INTERVIEW`, `ai-interview`, and `ai interview` as the same thing. */
function enumCandidate(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function takeKey(value: unknown, fallback: string, used: Set<string>): string {
  const candidate = typeof value === "string" && KEY_PATTERN.test(value.trim()) ? value.trim() : "";
  const key = candidate && !used.has(candidate) ? candidate : fallback;
  used.add(key);
  return key;
}

/** Invisible characters become spaces, not nothing: deleting one hidden between
 *  two words would fuse them, which is exactly the effect an attacker wants. */
function singleLine(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return truncate(value.replace(INVISIBLE_CHARACTERS, " ").replace(/\s+/g, " ").trim(), maxLength);
}

/** Keeps paragraph breaks, which matter in a question, but nothing invisible. */
function multiLine(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const cleaned = value
    // Before the invisible sweep, because a carriage return is itself one of the
    // control characters it removes.
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE_CHARACTERS, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return truncate(cleaned, maxLength);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength).trimEnd() : value;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function describe(value: unknown): string {
  return singleLine(typeof value === "string" ? value : typeof value, 40) || "unknown";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
