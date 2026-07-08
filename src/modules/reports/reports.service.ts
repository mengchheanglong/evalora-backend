import { Injectable } from "@nestjs/common";
import type { JsonValue, ModuleType } from "../../domain/evalora.types";
import type { AiService } from "../ai/ai.service";
import { evaluateResponse, generateCandidateReport, type EvaluateResponseInput, type EvaluationResultDto, type GeneratedCandidateReport } from "../ai/evaluation.service";
import { buildSessionOwnershipWhere, forbiddenResourceError, mergeWhere, type AccessContext } from "../auth/access-control";

interface ReportPersistenceClient {
  interviewSession?: {
    findFirst?(args: unknown): Promise<unknown | null>;
  };
  evaluation: {
    deleteMany(args: unknown): Promise<unknown>;
    createMany(args: unknown): Promise<unknown>;
  };
  candidateReport: {
    findUnique?(args: unknown): Promise<unknown | null>;
    upsert(args: unknown): Promise<unknown>;
  };
  $transaction<T>(operations: Array<Promise<T>>): Promise<T[]>;
}

interface PersistedCandidateReportRow {
  sessionId?: unknown;
  overallScore?: unknown;
  moduleScores?: unknown;
  summary?: unknown;
  strengths?: unknown;
  improvementAreas?: unknown;
  evidence?: unknown;
  reviewerSummary?: unknown;
  session?: {
    completedAt?: unknown;
    candidate?: { name?: unknown } | null;
    template?: { title?: unknown } | null;
  } | null;
}

interface EvaluationModuleRow {
  id?: unknown;
  title?: unknown;
  moduleType?: unknown;
  weight?: unknown;
}

interface EvaluationQuestionRow {
  id?: unknown;
  questionText?: unknown;
  rubric?: unknown;
  module?: EvaluationModuleRow | null;
}

interface EvaluationResponseRow {
  id?: unknown;
  responseText?: unknown;
  responseJson?: JsonValue | null;
  question?: EvaluationQuestionRow | null;
}

interface EvaluationSessionRow {
  id?: unknown;
  completedAt?: unknown;
  candidate?: { name?: unknown } | null;
  template?: { title?: unknown } | null;
  responses?: EvaluationResponseRow[] | null;
}

interface GroupedResponseEntry {
  question: EvaluationQuestionRow;
  response: EvaluationResponseRow;
}

interface GroupedModuleResponses {
  module: EvaluationModuleRow;
  entries: GroupedResponseEntry[];
}

export type ReportPersistenceResult =
  | { status: "persisted"; evaluationCount: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

interface PersistReportInput {
  report: GeneratedCandidateReport;
  evaluations: EvaluationResultDto[];
}

const REPORT_ADVISORY_NOTICE = "AI feedback is advisory and not a final hiring decision.";

const REPORT_EVALUATION_SESSION_INCLUDE = {
  candidate: { select: { name: true } },
  template: { select: { title: true } },
  responses: {
    include: {
      question: {
        include: {
          module: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  },
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma?: ReportPersistenceClient,
    private readonly aiService?: Pick<AiService, "evaluateResponse">,
  ) {}

  async getReport(sessionId: string, access?: AccessContext): Promise<GeneratedCandidateReport> {
    await this.assertReportAccess(sessionId, access);
    return (await this.readPersistedReport(sessionId)) ?? this.buildDemoReport(sessionId).report;
  }

  buildDemoReport(sessionId: string) {
    const evaluations = this.buildDemoEvaluations();
    const report = generateCandidateReport({
      sessionId,
      candidateName: "Demo Candidate",
      assessmentName: "Software Engineer Assessment",
      completedAt: new Date().toISOString(),
      evaluations,
      reviewerNotes: ["Reviewer should validate AI feedback against the original candidate responses."],
    });

    return { report, evaluations };
  }

  async generateAndPersistDemoReport(sessionId: string, access?: AccessContext) {
    await this.assertReportAccess(sessionId, access);
    const { report, evaluations } = this.buildDemoReport(sessionId);
    const persistence = await this.persistReport({ report, evaluations });

    return {
      ...report,
      generatedAt: new Date().toISOString(),
      persistence,
      message: persistence.status === "persisted" ? "Report generated and persisted." : `Report generated without persistence: ${persistence.reason}.`,
    };
  }

  async generateAndPersistReport(sessionId: string, access?: AccessContext) {
    const session = await this.loadSessionForEvaluation(sessionId, access);
    const evaluations = await this.evaluateSessionResponses(session);
    const report = generateCandidateReport({
      sessionId,
      candidateName: stringValue(session.candidate?.name, "Candidate"),
      assessmentName: stringValue(session.template?.title, "Assessment"),
      completedAt: isoDateString(session.completedAt),
      evaluations,
      reviewerNotes: ["Reviewer should validate AI feedback against the original candidate responses."],
    });
    const persistence = evaluations.length ? await this.persistReport({ report, evaluations }) : { status: "skipped" as const, reason: "no candidate responses" };

    return {
      ...report,
      generatedAt: new Date().toISOString(),
      persistence,
      message: persistence.status === "persisted" ? "Report generated from saved candidate responses and persisted." : `Report generated without persistence: ${persistence.reason}.`,
    };
  }

  async exportReport(sessionId: string, access?: AccessContext) {
    await this.assertReportAccess(sessionId, access);
    return {
      sessionId,
      status: "not_implemented",
      message: "PDF/export support is a future improvement unless prioritized.",
    };
  }

  async persistReport({ report, evaluations }: PersistReportInput): Promise<ReportPersistenceResult> {
    if (!this.prisma) {
      return { status: "skipped", reason: "database client unavailable" };
    }

    try {
      await this.prisma.$transaction([
        this.prisma.evaluation.deleteMany({ where: { sessionId: report.sessionId } }),
        this.prisma.evaluation.createMany({
          data: evaluations.map((evaluation) => ({
            sessionId: report.sessionId,
            moduleId: evaluation.moduleId ?? null,
            score: evaluation.score,
            feedback: evaluation.feedback,
            evidence: evaluation.evidence,
            criteriaScores: evaluation.criteriaScores,
          })),
        }),
        this.prisma.candidateReport.upsert({
          where: { sessionId: report.sessionId },
          create: {
            sessionId: report.sessionId,
            overallScore: report.overallScore,
            moduleScores: report.moduleScores,
            summary: report.summary,
            strengths: report.strengths,
            improvementAreas: report.improvementAreas,
            evidence: report.evidence,
            reviewerSummary: report.reviewerSummary,
          },
          update: {
            overallScore: report.overallScore,
            moduleScores: report.moduleScores,
            summary: report.summary,
            strengths: report.strengths,
            improvementAreas: report.improvementAreas,
            evidence: report.evidence,
            reviewerSummary: report.reviewerSummary,
          },
        }),
      ]);

      return { status: "persisted", evaluationCount: evaluations.length };
    } catch {
      return { status: "failed", reason: "database persistence failed" };
    }
  }

  private async readPersistedReport(sessionId: string): Promise<GeneratedCandidateReport | undefined> {
    const findUnique = this.prisma?.candidateReport?.findUnique;
    if (!findUnique) return undefined;

    try {
      const row = (await findUnique({
        where: { sessionId },
        include: {
          session: {
            select: {
              completedAt: true,
              candidate: { select: { name: true } },
              template: { select: { title: true } },
            },
          },
        },
      })) as PersistedCandidateReportRow | null;

      return row ? mapPersistedReport(row) : undefined;
    } catch {
      return undefined;
    }
  }

  private async assertReportAccess(sessionId: string, access?: AccessContext): Promise<void> {
    if (!access) return;
    const findFirst = requireMethod(this.prisma?.interviewSession?.findFirst, "interviewSession.findFirst");
    const session = await findFirst({ where: mergeWhere({ id: sessionId }, buildSessionOwnershipWhere(access)) });
    if (!session) throw forbiddenResourceError("Report");
  }

  private async loadSessionForEvaluation(sessionId: string, access?: AccessContext): Promise<EvaluationSessionRow> {
    const findFirst = requireMethod(this.prisma?.interviewSession?.findFirst, "interviewSession.findFirst");
    const session = (await findFirst({
      where: mergeWhere({ id: sessionId }, buildSessionOwnershipWhere(access)),
      include: REPORT_EVALUATION_SESSION_INCLUDE,
    })) as EvaluationSessionRow | null;
    if (!session) throw forbiddenResourceError("Report");
    return session;
  }

  private async evaluateSessionResponses(session: EvaluationSessionRow): Promise<EvaluationResultDto[]> {
    const groups = groupResponsesByModule(session.responses ?? []);
    const evaluations: EvaluationResultDto[] = [];

    for (const group of Array.from(groups.values())) {
      const input: EvaluateResponseInput = {
        moduleId: optionalString(group.module.id),
        moduleTitle: optionalString(group.module.title),
        moduleType: fromPrismaModuleType(group.module.moduleType),
        responseText: buildModuleResponseText(group.entries),
        rubric: unique(group.entries.flatMap((entry) => stringArray(entry.question.rubric))),
        weight: numberValue(group.module.weight, 1),
      };
      evaluations.push(await this.evaluateModuleResponse(input));
    }

    return evaluations;
  }

  private async evaluateModuleResponse(input: EvaluateResponseInput): Promise<EvaluationResultDto> {
    if (!this.aiService) return evaluateResponse(input);

    try {
      return await this.aiService.evaluateResponse(input);
    } catch {
      return evaluateResponse(input);
    }
  }

  private buildDemoEvaluations(): EvaluationResultDto[] {
    return [
      evaluateResponse({
        moduleId: "mod-ai-interview",
        moduleTitle: "AI Interview",
        moduleType: "ai_interview",
        responseText: "Candidate explained a project with clear trade-offs, testing steps, and team communication.",
        weight: 1,
      }),
      evaluateResponse({
        moduleId: "mod-coding",
        moduleTitle: "Coding Assessment",
        moduleType: "coding",
        responseText: "Candidate wrote readable code, considered edge cases, and described debugging with tests.",
        weight: 1.5,
      }),
      evaluateResponse({
        moduleId: "mod-work-style",
        moduleTitle: "Work-Style Assessment",
        moduleType: "work_style",
        responseText: "Candidate described listening to the team, owning follow-up actions, and adapting under deadline pressure.",
        weight: 1,
      }),
    ];
  }
}

function mapPersistedReport(row: PersistedCandidateReportRow): GeneratedCandidateReport {
  return {
    sessionId: stringValue(row.sessionId, ""),
    candidateName: stringValue(row.session?.candidate?.name, "Candidate"),
    assessmentName: stringValue(row.session?.template?.title, "Assessment"),
    completedAt: isoDateString(row.session?.completedAt),
    overallScore: numberValue(row.overallScore, 0),
    moduleScores: numberRecord(row.moduleScores),
    summary: stringValue(row.summary, "Persisted candidate report."),
    strengths: stringArray(row.strengths),
    improvementAreas: stringArray(row.improvementAreas),
    evidence: stringArray(row.evidence),
    reviewerSummary: optionalString(row.reviewerSummary),
    advisoryNotice: REPORT_ADVISORY_NOTICE,
  };
}

function groupResponsesByModule(responses: EvaluationResponseRow[]): Map<string, GroupedModuleResponses> {
  const groups = new Map<string, GroupedModuleResponses>();

  for (const response of responses) {
    const question = response.question;
    const module = question?.module;
    const responseText = optionalString(response.responseText);
    if (!question || !module || !responseText) continue;

    const key = optionalString(module.id) ?? `${optionalString(module.title) ?? "module"}:${optionalString(module.moduleType) ?? "unknown"}`;
    const group = groups.get(key) ?? { module, entries: [] };
    group.entries.push({ question, response });
    groups.set(key, group);
  }

  return groups;
}

function buildModuleResponseText(entries: GroupedResponseEntry[]): string {
  return entries
    .map((entry) => {
      const lines = [`Question: ${stringValue(entry.question.questionText, "Untitled question")}`, `Answer: ${stringValue(entry.response.responseText, "")}`];
      const structuredResponse = formatJson(entry.response.responseJson);
      if (structuredResponse) lines.push(`Structured response: ${structuredResponse}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

function fromPrismaModuleType(value: unknown): ModuleType {
  const normalized = optionalString(value)?.toLowerCase() as ModuleType | undefined;
  const knownTypes: ModuleType[] = ["ai_interview", "coding", "debugging", "work_style", "behavioral", "leadership", "communication", "problem_solving"];
  return normalized && knownTypes.includes(normalized) ? normalized : "ai_interview";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatJson(value: JsonValue | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function numberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isoDateString(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" && value.trim() ? value : undefined;
}

function requireMethod<T extends (...args: any[]) => any>(method: T | undefined, name: string): T {
  if (!method) throw new Error(`${name} is not available.`);
  return method;
}
