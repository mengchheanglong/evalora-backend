import type { CandidateReportDto, ModuleType } from "../../domain/evalora.types";

const RESPONSE_ADVISORY_NOTICE = "This AI feedback is advisory and must be reviewed by a human interviewer.";
const REPORT_ADVISORY_NOTICE = "AI feedback is advisory and not a final hiring decision.";

type CriteriaScores = Record<string, number>;

export interface EvaluateResponseInput {
  moduleId?: string;
  moduleTitle?: string;
  moduleType: ModuleType;
  responseText: string;
  rubric?: string[];
  weight?: number;
}

export interface EvaluationResultDto {
  moduleId?: string;
  moduleTitle: string;
  moduleType: ModuleType;
  weight: number;
  score: number;
  criteriaScores: CriteriaScores;
  feedback: string;
  strengths: string[];
  improvementAreas: string[];
  evidence: string[];
  advisoryNotice: string;
}

export interface GenerateCandidateReportInput {
  sessionId: string;
  candidateName: string;
  assessmentName: string;
  completedAt?: string;
  evaluations: EvaluationResultDto[];
  reviewerNotes?: string[];
}

export type GeneratedCandidateReport = CandidateReportDto & {
  completedAt?: string;
  reviewerSummary?: string;
};

export function evaluateResponse(input: EvaluateResponseInput): EvaluationResultDto {
  const moduleTitle = input.moduleTitle ?? titleForModule(input.moduleType);
  const response = input.responseText.trim();
  const rubric = input.rubric?.length ? input.rubric : defaultRubricFor(input.moduleType);
  const score = scoreResponse(response, rubric);

  return {
    moduleId: input.moduleId,
    moduleTitle,
    moduleType: input.moduleType,
    weight: positiveWeight(input.weight),
    score,
    criteriaScores: Object.fromEntries(rubric.map((criterion) => [criterion, score])) as CriteriaScores,
    feedback: `${moduleTitle} scored ${score}/5 based on rubric evidence from the candidate response.`,
    strengths: inferStrengths(response, input.moduleType),
    improvementAreas: inferImprovementAreas(response, input.moduleType),
    evidence: extractEvidence(response),
    advisoryNotice: RESPONSE_ADVISORY_NOTICE,
  };
}

export function generateCandidateReport(input: GenerateCandidateReportInput): GeneratedCandidateReport {
  const overallScore = weightedAverage(input.evaluations);

  return {
    sessionId: input.sessionId,
    candidateName: input.candidateName,
    assessmentName: input.assessmentName,
    completedAt: input.completedAt,
    overallScore,
    moduleScores: Object.fromEntries(input.evaluations.map((evaluation) => [evaluation.moduleTitle, evaluation.score])),
    summary: `${input.candidateName} completed ${input.assessmentName} with an overall score of ${overallScore}/5. The report is evidence-based and prepared for human reviewer judgment.`,
    strengths: unique(input.evaluations.flatMap((evaluation) => evaluation.strengths)),
    improvementAreas: unique(input.evaluations.flatMap((evaluation) => evaluation.improvementAreas)),
    evidence: unique(input.evaluations.flatMap((evaluation) => evaluation.evidence)),
    reviewerSummary: input.reviewerNotes?.join(" "),
    advisoryNotice: REPORT_ADVISORY_NOTICE,
  };
}

function scoreResponse(response: string, rubric: string[]): number {
  if (!response) return 1;

  const wordCount = response.split(/\s+/).filter(Boolean).length;
  const criteriaHits = rubric.filter((criterion) => includesAny(response, criterion.split(/[\s-]+/))).length;
  const actionHits = countMatches(response, ["explain", "clarify", "listen", "test", "measure", "trade-off", "deadline", "client", "team", "evidence"]);

  const rawScore = 1 + Math.min(2, wordCount / 25) + Math.min(1, criteriaHits / Math.max(1, rubric.length)) + Math.min(1, actionHits / 4);
  return roundOne(clamp(rawScore, 1, 5));
}

function inferStrengths(response: string, moduleType: ModuleType): string[] {
  const strengths: string[] = [];
  if (includesAny(response, ["explain", "clarify", "communicate"])) strengths.push("Communicates reasoning clearly");
  if (includesAny(response, ["listen", "empathy", "client", "team"])) strengths.push("Shows professional collaboration awareness");
  if (includesAny(response, ["test", "debug", "edge", "trade-off", "measure"])) strengths.push("Uses practical evidence and problem-solving steps");

  if (!strengths.length) strengths.push(`Provides a relevant ${titleForModule(moduleType).toLowerCase()} response`);
  return strengths;
}

function inferImprovementAreas(response: string, moduleType: ModuleType): string[] {
  const areas: string[] = [];
  if (!includesAny(response, ["metric", "measure", "result", "impact"])) areas.push("Add measurable results or impact where possible");
  if (!includesAny(response, ["example", "because", "evidence"])) areas.push("Include more concrete response evidence");
  if (!areas.length) areas.push(`Keep responses concise while preserving ${titleForModule(moduleType).toLowerCase()} evidence`);
  return areas;
}

function extractEvidence(response: string): string[] {
  if (!response) return ["No candidate response text was provided."];
  const sentences = response.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  return sentences.length ? sentences.slice(0, 2) : [truncate(response, 180)];
}

function weightedAverage(evaluations: EvaluationResultDto[]): number {
  if (!evaluations.length) return 0;
  const totalWeight = evaluations.reduce((sum, evaluation) => sum + positiveWeight(evaluation.weight), 0);
  const weightedTotal = evaluations.reduce((sum, evaluation) => sum + evaluation.score * positiveWeight(evaluation.weight), 0);
  return roundOne(weightedTotal / totalWeight);
}

function defaultRubricFor(moduleType: ModuleType): string[] {
  switch (moduleType) {
    case "coding":
    case "debugging":
      return ["correctness", "readability", "edge cases", "debugging", "complexity"];
    case "leadership":
    case "communication":
      return ["clarity", "empathy", "decision-making", "professionalism", "problem-solving"];
    case "work_style":
    case "behavioral":
      return ["collaboration", "ownership", "adaptability", "motivation", "reflection"];
    default:
      return ["clarity", "relevance", "depth", "evidence", "reflection"];
  }
}

function titleForModule(moduleType: ModuleType): string {
  return moduleType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function includesAny(source: string, terms: string[]): boolean {
  const lowerSource = source.toLowerCase();
  return terms.some((term) => lowerSource.includes(term.toLowerCase()));
}

function countMatches(source: string, terms: string[]): number {
  return terms.filter((term) => includesAny(source, [term])).length;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function positiveWeight(value?: number): number {
  return value && value > 0 ? value : 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
