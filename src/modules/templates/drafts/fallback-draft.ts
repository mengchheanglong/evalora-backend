import { PREBUILT_ASSESSMENT_TEMPLATES, type PrebuiltAssessmentTemplateDefinition } from "../prebuilt-templates";
import type { GeneratedTemplateDraft, TemplateDraftGenerationInput } from "./template-draft.types";

/**
 * What a user gets when the AI provider is unavailable, unconfigured, or returns
 * nothing usable.
 *
 * Rather than fail the request, the closest researched blueprint from the prebuilt
 * catalog is offered as a starting draft. It is still fully editable and still has
 * to be confirmed, so the guarantee the feature makes — nothing is published
 * without a human — holds identically on this path.
 */

/** How far into an uploaded document we look for role keywords. */
const MATCH_SAMPLE_CHARS = 4_000;
const MIN_KEYWORD_LENGTH = 3;

/** Words that appear in every job description and match nothing useful. */
const STOP_WORDS = new Set([
  "and", "the", "for", "with", "you", "our", "are", "will", "who", "this", "that", "have", "from",
  "role", "team", "work", "years", "experience", "job", "description", "about", "your", "must",
  "should", "able", "strong", "good", "great", "new", "all", "any", "senior", "junior", "lead",
]);

export function buildFallbackProposal(input: TemplateDraftGenerationInput): GeneratedTemplateDraft {
  const template = pickClosestTemplate(input);
  return {
    title: input.roleType ? `${input.roleType} Assessment` : template.title,
    description: template.description,
    roleType: input.roleType?.trim() || template.roleType,
    timeLimitMin: template.timeLimitMin,
    modules: template.modules.map((module) => ({
      type: module.type,
      title: module.title,
      description: module.description,
      weightRationale: `Suggested from Evalora's researched ${template.roleType} blueprint, where this module carries ${describeEmphasis(module.weight)} emphasis.`,
      weightSignals: {
        // The blueprint's researched weight is the only importance signal available
        // offline, so it drives both role importance and risk.
        roleImportance: scaleWeight(module.weight),
        riskIfWeak: scaleWeight(module.weight),
        evidenceVolume: evidenceVolume(module.type, module.questions.length),
        difficulty: 3,
        essential: module.weight >= 1.3,
      },
      questions: module.questions.map((question) => ({
        questionText: question.questionText,
        questionType: question.questionType,
        options: question.options,
        rubric: question.rubric,
      })),
    })),
  };
}

/** Keyword overlap between what the user supplied and each blueprint's role wording. */
export function pickClosestTemplate(input: TemplateDraftGenerationInput): PrebuiltAssessmentTemplateDefinition {
  const haystack = keywords(
    [input.roleType ?? "", input.idea ?? "", (input.sourceText ?? "").slice(0, MATCH_SAMPLE_CHARS)].join(" "),
  );

  let best = PREBUILT_ASSESSMENT_TEMPLATES[0];
  let bestScore = -1;

  for (const template of PREBUILT_ASSESSMENT_TEMPLATES) {
    const needles = keywords(`${template.roleType} ${template.title}`);
    // Role words are worth more when they came from the explicit role field, which
    // `keywords` cannot see — so an exact role-type match short-circuits the scan.
    if (input.roleType && input.roleType.trim().toLowerCase() === template.roleType.toLowerCase()) return template;

    const score = needles.filter((needle) => haystack.includes(needle)).length;
    if (score > bestScore) {
      best = template;
      bestScore = score;
    }
  }

  return best;
}

function keywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9+#]+/)
        .filter((word) => word.length >= MIN_KEYWORD_LENGTH && !STOP_WORDS.has(word)),
    ),
  ];
}

/** Blueprint weights sit around 1.0-1.6; map that band onto the 1-5 signal scale. */
function scaleWeight(weight: number): number {
  if (!Number.isFinite(weight)) return 3;
  return Math.min(5, Math.max(1, Math.round(weight * 3)));
}

function evidenceVolume(moduleType: string, questionCount: number): number {
  // An AI interview authors no questions up front but collects a full conversation.
  if (moduleType === "ai_interview") return 4;
  if (questionCount >= 8) return 5;
  if (questionCount >= 5) return 4;
  if (questionCount >= 3) return 3;
  return questionCount > 0 ? 2 : 1;
}

function describeEmphasis(weight: number): string {
  if (weight >= 1.4) return "heavy";
  if (weight >= 1.15) return "above-average";
  return "standard";
}
