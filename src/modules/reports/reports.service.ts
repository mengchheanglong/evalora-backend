import { Injectable, NotFoundException } from "@nestjs/common";
import { readStructuredAiFollowUp, splitEmbeddedFollowUp } from "../../common/embedded-follow-up";
import { basedOnQuestionByAssistantId } from "../../common/ai-message-provenance";
import type { JsonValue, ModuleType } from "../../domain/evalora.types";
import type { AiService } from "../ai/ai.service";
import { evaluateResponse, generateCandidateReport, type EvaluateResponseInput, type EvaluationResultDto, type GeneratedCandidateReport } from "../ai/evaluation.service";
import { buildSessionOwnershipWhere, forbiddenResourceError, mergeWhere, type AccessContext } from "../auth/access-control";
import { PREBUILT_ASSESSMENT_TEMPLATES } from "../templates/prebuilt-templates";
import type { QuestionSnapshot } from "../responses/responses.service";

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
  reviewerNote?: {
    findMany(args: unknown): Promise<unknown[]>;
    create(args: unknown): Promise<unknown>;
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
  questionSnapshot?: JsonValue | null;
  question?: EvaluationQuestionRow | null;
}

interface EvaluationAiMessageRow {
  id: string;
  role: string;
  content: string;
  metadata?: JsonValue | null;
  createdAt?: Date | null;
}

interface EvaluationSessionRow {
  id?: unknown;
  completedAt?: unknown;
  candidate?: { name?: unknown } | null;
  template?: { title?: unknown; modules?: EvaluationModuleRow[] | null } | null;
  responses?: EvaluationResponseRow[] | null;
  aiMessages?: EvaluationAiMessageRow[] | null;
  codeSubmissions?: EvaluationCodeSubmissionRow[] | null;
  interviewerFollowUps?: EvaluationInterviewerFollowUpRow[] | null;
}

interface EvaluationInterviewerFollowUpRow {
  moduleId?: unknown;
  parentQuestionId?: unknown;
  questionText?: unknown;
  answerText?: unknown;
  askedBy?: { name?: unknown } | null;
}

interface EvaluationCodeSubmissionRow {
  questionId?: unknown;
  language?: unknown;
  sourceCode?: unknown;
  stdout?: unknown;
  stderr?: unknown;
  compileOutput?: unknown;
  status?: unknown;
  score?: unknown;
  createdAt?: unknown;
}

interface ReviewerNoteRow {
  id?: unknown;
  sessionId?: unknown;
  note?: unknown;
  createdAt?: unknown;
  reviewer?: { id?: unknown; name?: unknown } | null;
}

interface GroupedResponseEntry {
  question: EvaluationQuestionRow;
  response: EvaluationResponseRow;
}

interface GroupedModuleResponses {
  module: EvaluationModuleRow;
  entries: GroupedResponseEntry[];
}

/**
 * The two halves of a module's material, kept apart all the way to the scorer:
 * `responseText` is only what the candidate wrote, `questionContext` is the
 * question / interviewer / challenge wording they were replying to.
 */
interface ModuleEvidence {
  responseText: string;
  questionContext: string[];
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
const CANONICAL_PREBUILT_RUBRIC_BY_QUESTION = new Map(
  PREBUILT_ASSESSMENT_TEMPLATES.flatMap((template) =>
    template.modules.flatMap((module) =>
      module.questions.map((question) => [normalizeQuestionText(question.questionText), question.rubric] as const),
    ),
  ),
);

const REPORT_EVALUATION_SESSION_INCLUDE = {
  candidate: { select: { name: true } },
  template: {
    select: {
      title: true,
      modules: {
        select: { id: true, title: true, moduleType: true, weight: true },
      },
    },
  },
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
  aiMessages: {
    select: { id: true, role: true, content: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  },
  codeSubmissions: {
    select: {
      questionId: true,
      language: true,
      sourceCode: true,
      stdout: true,
      stderr: true,
      compileOutput: true,
      status: true,
      score: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  },
  // Answered human follow-ups are extra evidence for their parent module; the
  // where-clause drops cancelled and still-unanswered questions.
  interviewerFollowUps: {
    where: { status: "ANSWERED" },
    select: {
      moduleId: true,
      parentQuestionId: true,
      questionText: true,
      answerText: true,
      sequence: true,
      askedBy: { select: { name: true } },
    },
    orderBy: { sequence: "asc" },
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
    const report = await this.readPersistedReport(sessionId);
    if (!report) throw new NotFoundException("Report is not ready. Generate the report after the candidate completes the assessment.");
    return report;
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

  async listReviewerNotes(sessionId: string, access?: AccessContext) {
    await this.assertReportAccess(sessionId, access);
    const findMany = requireMethod(this.prisma?.reviewerNote?.findMany, "reviewerNote.findMany");
    const rows = (await findMany({
      where: { sessionId },
      include: { reviewer: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    })) as ReviewerNoteRow[];

    return rows.map(mapReviewerNote);
  }

  async addReviewerNote(sessionId: string, note: string | undefined, access?: AccessContext) {
    await this.assertReportAccess(sessionId, access);
    if (!access) throw forbiddenResourceError("Reviewer note");
    const normalizedNote = requireReviewerNote(note);
    const create = requireMethod(this.prisma?.reviewerNote?.create, "reviewerNote.create");
    const row = (await create({
      data: {
        sessionId,
        reviewerId: access.userId,
        note: normalizedNote,
      },
      include: { reviewer: { select: { id: true, name: true } } },
    })) as ReviewerNoteRow;

    return mapReviewerNote(row);
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
        relationLoadStrategy: "join",
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
      relationLoadStrategy: "join",
      where: mergeWhere({ id: sessionId }, buildSessionOwnershipWhere(access)),
      include: REPORT_EVALUATION_SESSION_INCLUDE,
    })) as EvaluationSessionRow | null;
    if (!session) throw forbiddenResourceError("Report");
    return session;
  }

  private async evaluateSessionResponses(session: EvaluationSessionRow): Promise<EvaluationResultDto[]> {
    const groups = groupResponsesByModule(session.responses ?? []);
    const aiFollowUpQuestions = buildAiFollowUpQuestionIndex(session.aiMessages ?? []);
    const inputs: EvaluateResponseInput[] = [];
    const templateModules = session.template?.modules ?? [];

    for (const module of templateModules) {
      const moduleId = optionalString(module.id);
      const group = moduleId ? groups.get(moduleId) : undefined;
      const evidence = group ? buildModuleEvidence(group.entries, aiFollowUpQuestions) : emptyEvidence();
      inputs.push({
        moduleId,
        moduleTitle: optionalString(module.title),
        moduleType: fromPrismaModuleType(module.moduleType),
        responseText: evidence.responseText,
        questionContext: evidence.questionContext,
        rubric: group ? unique(group.entries.flatMap((entry) => entryRubric(entry))) : [],
        weight: numberValue(module.weight, 1),
      });
    }

    // Keep reports compatible with older/mocked rows where modules were loaded
    // only through Response.question.module.
    for (const [key, group] of groups) {
      if (inputs.some((input) => input.moduleId === key)) continue;
      const evidence = buildModuleEvidence(group.entries, aiFollowUpQuestions);
      inputs.push({
        moduleId: optionalString(group.module.id),
        moduleTitle: optionalString(group.module.title),
        moduleType: fromPrismaModuleType(group.module.moduleType),
        responseText: evidence.responseText,
        questionContext: evidence.questionContext,
        rubric: unique(group.entries.flatMap((entry) => entryRubric(entry))),
        weight: numberValue(group.module.weight, 1),
      });
    }

    // Adaptive AI-interview answers are stored as responses with no linked
    // question (they are AI-generated, not part of the template's question bank),
    // so groupResponsesByModule skips them. Fold them into the AI_INTERVIEW
    // module — mirroring the coding-submission handling below — so the interview
    // the candidate actually completed contributes to its score and evidence.
    const adaptiveEvidence = buildAdaptiveInterviewEvidence(session.responses ?? []);
    if (adaptiveEvidence.responseText) {
      const aiModule = session.template?.modules?.find(
        (module) => fromPrismaModuleType(module.moduleType) === "ai_interview",
      );
      if (aiModule) {
        const aiModuleId = optionalString(aiModule.id);
        const existing = findModuleInput(inputs, aiModule);
        if (existing) {
          mergeEvidence(existing, adaptiveEvidence);
        } else {
          inputs.push({
            moduleId: aiModuleId,
            moduleTitle: optionalString(aiModule.title) ?? "AI Interview",
            moduleType: "ai_interview",
            responseText: adaptiveEvidence.responseText,
            questionContext: adaptiveEvidence.questionContext,
            rubric: [],
            weight: numberValue(aiModule.weight, 1),
          });
        }
      }
    }

    // Answered interviewer follow-ups are folded into their parent module as
    // extra evidence. They never create a new weighted module, so the overall
    // score formula is unchanged; only that module's evidence grows.
    const followUpsByModule = groupFollowUpsByModule(session.interviewerFollowUps ?? [], session.responses ?? []);
    for (const [moduleId, followUps] of followUpsByModule) {
      const evidence = buildInterviewerFollowUpEvidence(followUps);
      // An interviewer question with no candidate answer contributes nothing at
      // all — not even context — so asking questions can never move a score.
      if (!evidence.responseText) continue;
      const module = templateModules.find((candidate) => optionalString(candidate.id) === moduleId);
      const existing = inputs.find((input) => input.moduleId === moduleId);
      if (existing) {
        mergeEvidence(existing, evidence);
      } else if (module) {
        inputs.push({
          moduleId,
          moduleTitle: optionalString(module.title),
          moduleType: fromPrismaModuleType(module.moduleType),
          responseText: evidence.responseText,
          questionContext: evidence.questionContext,
          rubric: [],
          weight: numberValue(module.weight, 1),
        });
      }
    }

    const codingModule = session.template?.modules?.find(
      (module) => fromPrismaModuleType(module.moduleType) === "coding",
    );
    if (codingModule && session.codeSubmissions?.length) {
      const codeEvidence = buildCodeSubmissionEvidence(session.codeSubmissions);
      const objectiveScore = objectiveCodeScore(session.codeSubmissions);
      const existing = findModuleInput(inputs, codingModule);
      if (existing) {
        mergeEvidence(existing, codeEvidence);
        existing.objectiveScore = objectiveScore;
      } else {
        inputs.push({
          moduleId: optionalString(codingModule.id),
          moduleTitle: optionalString(codingModule.title) ?? "Coding Assessment",
          moduleType: "coding",
          responseText: codeEvidence.responseText,
          questionContext: codeEvidence.questionContext,
          rubric: ["correctness", "execution evidence", "code clarity", "validation", "problem solving"],
          weight: numberValue(codingModule.weight, 1),
          objectiveScore,
        });
      }
    }

    return Promise.all(inputs.map((input) => this.evaluateModuleResponse(input)));
  }

  private async evaluateModuleResponse(input: EvaluateResponseInput): Promise<EvaluationResultDto> {
    if (!input.responseText.trim() || !this.aiService) return evaluateResponse(input);

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
  const overallScore = numberValue(row.overallScore, 0);
  return {
    sessionId: stringValue(row.sessionId, ""),
    candidateName: stringValue(row.session?.candidate?.name, "Candidate"),
    assessmentName: stringValue(row.session?.template?.title, "Assessment"),
    completedAt: isoDateString(row.session?.completedAt),
    overallScore,
    moduleScores: numberRecord(row.moduleScores),
    summary: stringValue(row.summary, "Persisted candidate report."),
    strengths: overallScore > 0 ? stringArray(row.strengths) : [],
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

function findModuleInput(inputs: EvaluateResponseInput[], module: EvaluationModuleRow): EvaluateResponseInput | undefined {
  const moduleId = optionalString(module.id);
  if (moduleId) return inputs.find((input) => input.moduleId === moduleId);
  const moduleTitle = optionalString(module.title);
  return inputs.find((input) => input.moduleTitle === moduleTitle && input.moduleType === fromPrismaModuleType(module.moduleType));
}

function emptyEvidence(): ModuleEvidence {
  return { responseText: "", questionContext: [] };
}

/** Folds extra material into a module input while keeping the candidate's words
 *  and the question wording in their own fields. */
function mergeEvidence(target: EvaluateResponseInput, evidence: ModuleEvidence): void {
  target.responseText = [target.responseText, evidence.responseText].filter(Boolean).join("\n\n");
  target.questionContext = [...(target.questionContext ?? []), ...evidence.questionContext];
}

/**
 * Collects the candidate's adaptive AI-interview answers (responses stored without
 * a linked question, tagged `responseJson.adaptive: true`). The stored responseText
 * embeds the AI-generated question above the answer, so the question is split back
 * out here — it is context and must never reach the scored text.
 */
function buildAdaptiveInterviewEvidence(responses: EvaluationResponseRow[]): ModuleEvidence {
  const answers: string[] = [];
  const questionContext: string[] = [];

  for (const response of responses) {
    if (response.question || !isAdaptiveResponse(response)) continue;
    const answer = adaptiveAnswerText(response);
    if (!answer) continue;
    answers.push(answer);
    const question = adaptiveQuestionText(response);
    if (question) questionContext.push(`AI interview question: ${question}`);
  }

  return { responseText: answers.join("\n\n"), questionContext };
}

/** The candidate's own words from an adaptive response, with the AI question stripped. */
function adaptiveAnswerText(response: EvaluationResponseRow): string | undefined {
  const stored = optionalString(response.responseText);
  if (!stored) return undefined;
  const answer = stored.match(/(?:^|\n)Response:\s*([\s\S]*)$/)?.[1];
  if (answer?.trim()) return answer.trim();
  // Rows saved before the question was split out lead with a single "AI interview - <question>"
  // heading; dropping it is safer than scoring the question as the candidate's answer.
  return optionalString(stored.replace(/^AI interview\s*[-–—][^\n]*\n+/, ""));
}

function adaptiveQuestionText(response: EvaluationResponseRow): string | undefined {
  const json = response.responseJson;
  const stored = typeof json === "object" && json !== null && !Array.isArray(json) ? optionalString((json as Record<string, unknown>).question) : undefined;
  if (stored) return stored;
  return optionalString(response.responseText)?.match(/^AI interview\s*[-–—]\s*([^\n]*)/)?.[1]?.trim();
}

function isAdaptiveResponse(response: EvaluationResponseRow): boolean {
  const json = response.responseJson;
  return typeof json === "object" && json !== null && !Array.isArray(json) && (json as Record<string, unknown>).adaptive === true;
}

/**
 * Buckets answered follow-ups by the module they belong to. When a follow-up
 * stored only a parent question, the module is resolved from that question's
 * saved response so the evidence still lands in the right module.
 */
function groupFollowUpsByModule(
  followUps: EvaluationInterviewerFollowUpRow[],
  responses: EvaluationResponseRow[],
): Map<string, EvaluationInterviewerFollowUpRow[]> {
  const moduleByQuestion = new Map<string, string>();
  for (const response of responses) {
    const questionId = optionalString(response.question?.id);
    const moduleId = optionalString(response.question?.module?.id);
    if (questionId && moduleId) moduleByQuestion.set(questionId, moduleId);
  }

  const grouped = new Map<string, EvaluationInterviewerFollowUpRow[]>();
  for (const followUp of followUps) {
    const parentQuestionId = optionalString(followUp.parentQuestionId);
    const moduleId = optionalString(followUp.moduleId) ?? (parentQuestionId ? moduleByQuestion.get(parentQuestionId) : undefined);
    if (!moduleId) continue;
    const bucket = grouped.get(moduleId) ?? [];
    bucket.push(followUp);
    grouped.set(moduleId, bucket);
  }
  return grouped;
}

/**
 * A leading follow-up ("Would you have used a consistent-hash ring here?") puts the
 * interviewer's vocabulary in play, so the question is carried as context only and
 * the candidate's answer alone becomes the scored text.
 */
function buildInterviewerFollowUpEvidence(followUps: EvaluationInterviewerFollowUpRow[]): ModuleEvidence {
  const answers: string[] = [];
  const questionContext: string[] = [];

  for (const followUp of followUps) {
    const answer = optionalString(followUp.answerText);
    if (!answer) continue;
    const asker = optionalString(followUp.askedBy?.name);
    const question = stringValue(followUp.questionText, "Interviewer follow-up");
    answers.push(answer);
    questionContext.push(`Interviewer follow-up${asker ? ` by ${asker}` : ""}: ${question}`);
  }

  return { responseText: answers.join("\n\n"), questionContext };
}

/**
 * The frozen copy of the question the candidate actually answered, written onto
 * the response at save time. Read defensively: it is absent on free-form and
 * adaptive answers, on rows saved before snapshots existed, and when the save-time
 * question lookup failed — those fall back to the live template row.
 */
function readQuestionSnapshot(response: EvaluationResponseRow): Partial<QuestionSnapshot> | undefined {
  if (response.questionSnapshot && typeof response.questionSnapshot === "object" && !Array.isArray(response.questionSnapshot)) {
    return response.questionSnapshot as Partial<QuestionSnapshot>;
  }
  const responseJson = response.responseJson;
  if (!responseJson || typeof responseJson !== "object" || Array.isArray(responseJson)) return undefined;
  const legacy = (responseJson as Record<string, unknown>).questionSnapshot;
  return legacy && typeof legacy === "object" && !Array.isArray(legacy)
    ? legacy as Partial<QuestionSnapshot>
    : undefined;
}

/**
 * Versioned private snapshots are authoritative, including an intentionally
 * empty rubric. Unversioned snapshots came from the unfinished public storage
 * format and cannot be trusted for scoring.
 *
 * A seeded database may still contain the verbose prebuilt rewrite after the
 * source catalog is corrected. For an exact prebuilt question, replace only that
 * known instruction-style shape with the canonical concept rubric. Concise
 * custom rubrics remain untouched.
 */
function entryRubric(entry: GroupedResponseEntry): string[] {
  const snapshot = readQuestionSnapshot(entry.response);
  if (snapshot?.rubricVersion === 1) return stringArray(snapshot.rubric);

  const liveRubric = stringArray(entry.question.rubric);
  const questionText = optionalString(snapshot?.questionText) ?? optionalString(entry.question.questionText);
  const canonical = questionText
    ? CANONICAL_PREBUILT_RUBRIC_BY_QUESTION.get(normalizeQuestionText(questionText))
    : undefined;
  return canonical && isInstructionStyleRubric(liveRubric) ? canonical : liveRubric;
}

/** The wording the candidate was shown, so an edited template can no longer re-label
 *  a past answer in the report. */
function entryQuestionText(entry: GroupedResponseEntry): string {
  const snapshot = readQuestionSnapshot(entry.response);
  return optionalString(snapshot?.questionText) ?? stringValue(entry.question.questionText, "Untitled question");
}

/**
 * The stored JSON minus the question snapshot. The snapshot holds the question
 * wording, and this JSON is serialised into the SCORED text — leaving it in would
 * feed the assessment author's words back to the scorer as if the candidate had
 * written them, which a keyword-stuffed question could exploit for free marks.
 * The wording still reaches the scorer, but only as questionContext.
 */
function structuredResponseJson(value: JsonValue | null | undefined): JsonValue | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value ?? undefined;
  const rest = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "questionSnapshot" && key !== "aiFollowUp"),
  );
  return Object.keys(rest).length ? (rest as JsonValue) : undefined;
}

function buildModuleEvidence(
  entries: GroupedResponseEntry[],
  aiFollowUpQuestions: Map<string, string>,
): ModuleEvidence {
  const answers: string[] = [];
  const questionContext: string[] = [];

  for (const entry of entries) {
    const questionText = entryQuestionText(entry);
    // The stored column can carry an AI follow-up exchange appended to the
    // candidate's answer. Its QUESTION is model-authored, so it belongs in the
    // context alongside the template question, never in the scored text.
    const legacy = splitEmbeddedFollowUp(stringValue(entry.response.responseText, ""));
    const structured = readStructuredAiFollowUp(entry.response.responseJson);
    const followUp = legacy.followUp ?? (
      structured
        ? {
          questionText: structured.questionText ?? aiFollowUpQuestions.get(questionText) ?? "AI follow-up question",
          answerText: structured.answerText,
        }
        : undefined
    );

    const lines = [legacy.answerText ?? ""];
    // The candidate's reply to the follow-up is still their own words.
    if (followUp?.answerText) lines.push(followUp.answerText);
    const structuredResponse = formatJson(structuredResponseJson(entry.response.responseJson));
    if (structuredResponse) lines.push(`Structured response: ${structuredResponse}`);

    const answer = lines.filter(Boolean).join("\n");
    // Context is pushed only alongside a kept answer so the two arrays stay in
    // step; a reviewer pairing entry N of each must not read a mismatched pair.
    if (!answer) continue;
    answers.push(answer);
    questionContext.push(
      followUp
        ? `Question: ${questionText}\nAI follow-up: ${followUp.questionText}`
        : `Question: ${questionText}`,
    );
  }

  return { responseText: answers.join("\n\n"), questionContext };
}

function buildAiFollowUpQuestionIndex(messages: EvaluationAiMessageRow[]): Map<string, string> {
  const basedOnQuestion = basedOnQuestionByAssistantId(messages);
  const questions = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const parent = basedOnQuestion.get(message.id);
    const question = optionalString(message.content);
    if (parent && question) questions.set(parent, question);
  }
  return questions;
}

function normalizeQuestionText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isInstructionStyleRubric(rubric: string[]): boolean {
  return rubric.some((criterion) => {
    const words = criterion.trim().split(/\s+/);
    return words.length > 4
      || /\b(describe|explain|discuss|mention|provide|show|demonstrate|include|outline)\b/i.test(criterion);
  });
}

function buildCodeSubmissionEvidence(submissions: EvaluationCodeSubmissionRow[]): ModuleEvidence {
  const latestByQuestion = new Map<string, EvaluationCodeSubmissionRow>();
  for (const submission of submissions) {
    latestByQuestion.set(stringValue(submission.questionId, "coding-question"), submission);
  }

  const questionContext: string[] = [];
  const responseText = Array.from(latestByQuestion.values())
    .map((submission, index) => {
      // The challenge identifier belongs to the assessment author, not the candidate.
      questionContext.push(`Coding challenge ${index + 1}: ${stringValue(submission.questionId, "unknown")}`);
      const sourceCode = stringValue(submission.sourceCode, "").slice(0, 6_000);
      const diagnostics = [optionalString(submission.compileOutput), optionalString(submission.stderr)].filter(Boolean).join("\n");
      return [
        `Language: ${stringValue(submission.language, "unknown")}`,
        `Sandbox status: ${stringValue(submission.status, "unknown")}`,
        `Automated test score: ${numberValue(submission.score, 0)} out of 100`,
        optionalString(submission.stdout) ? `Standard output: ${optionalString(submission.stdout)}` : undefined,
        diagnostics ? `Diagnostics: ${diagnostics}` : undefined,
        sourceCode ? `Submitted code:\n${sourceCode}` : undefined,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return { responseText, questionContext };
}

function objectiveCodeScore(submissions: EvaluationCodeSubmissionRow[]): number {
  const latestByQuestion = new Map<string, EvaluationCodeSubmissionRow>();
  for (const submission of submissions) {
    latestByQuestion.set(stringValue(submission.questionId, "coding-question"), submission);
  }
  if (!latestByQuestion.size) return 0;
  const averagePercent = Array.from(latestByQuestion.values())
    .reduce((sum, submission) => sum + numberValue(submission.score, 0), 0) / latestByQuestion.size;
  return Math.round((averagePercent / 20) * 100) / 100;
}

function mapReviewerNote(row: ReviewerNoteRow) {
  return {
    id: stringValue(row.id, ""),
    sessionId: stringValue(row.sessionId, ""),
    note: stringValue(row.note, ""),
    reviewer: {
      id: stringValue(row.reviewer?.id, ""),
      name: stringValue(row.reviewer?.name, "Reviewer"),
    },
    createdAt: isoDateString(row.createdAt),
  };
}

function requireReviewerNote(note: string | undefined): string {
  const normalized = note?.trim();
  if (!normalized) throw new Error("Reviewer note is required.");
  if (normalized.length > 2_000) throw new Error("Reviewer note must be 2,000 characters or fewer.");
  return normalized;
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
