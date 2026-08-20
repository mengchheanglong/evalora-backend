import { Injectable } from "@nestjs/common";
import { readStructuredAiFollowUp, splitEmbeddedFollowUp } from "../../common/embedded-follow-up";
import { basedOnQuestionByAssistantId } from "../../common/ai-message-provenance";
import { DEFAULT_LIST_LIMIT } from "../../common/query.constants";
import { buildSessionOwnershipWhere, forbiddenResourceError, mergeWhere, type AccessContext } from "../auth/access-control";
import { canManageSessionFollowUps } from "../sessions/interviewer-assignment";
import {
  buildTruncation,
  countByOrigin,
  countSourceRows,
  fromPrismaFollowUpStatus,
  fromPrismaSessionStatus,
  TRANSCRIPT_ORIGIN_RANK,
  TRANSCRIPT_SOURCE_KEYS,
  type SessionTranscriptDto,
  type TranscriptAiMessageRow,
  type TranscriptCodeSubmissionRow,
  type TranscriptEntry,
  type TranscriptEntryDraft,
  type TranscriptFollowUpRow,
  type TranscriptIntegrityEvent,
  type TranscriptIntegrityEventRow,
  type TranscriptModuleRow,
  type TranscriptResponseRow,
  type TranscriptSessionRow,
  type TranscriptSourceTotals,
} from "./transcript.types";

/** Narrow client surface so the service is unit-testable with a plain object. */
export interface TranscriptPrismaClient {
  interviewSession: {
    findFirst(args: unknown): Promise<TranscriptSessionRow | null>;
  };
}

export const TRANSCRIPT_SESSION_INCLUDE = {
  candidate: { select: { id: true, name: true, email: true } },
  template: {
    select: {
      title: true,
      modules: {
        select: {
          id: true,
          title: true,
          moduleType: true,
          orderIndex: true,
          questions: { select: { id: true, questionText: true } },
        },
        orderBy: { orderIndex: "asc" },
      },
    },
  },
  responses: {
    select: {
      id: true,
      responseText: true,
      responseJson: true,
      questionSnapshot: true,
      createdAt: true,
      question: {
        select: {
          id: true,
          questionText: true,
          module: { select: { id: true, title: true, moduleType: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: DEFAULT_LIST_LIMIT,
  },
  aiMessages: {
    select: { id: true, role: true, content: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: DEFAULT_LIST_LIMIT,
  },
  codeSubmissions: {
    select: {
      id: true,
      questionId: true,
      language: true,
      sourceCode: true,
      stdout: true,
      stderr: true,
      compileOutput: true,
      testResults: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: DEFAULT_LIST_LIMIT,
  },
  interviewerFollowUps: {
    select: {
      id: true,
      moduleId: true,
      parentQuestionId: true,
      questionText: true,
      answerText: true,
      sequence: true,
      status: true,
      sentAt: true,
      answeredAt: true,
      askedBy: { select: { id: true, name: true } },
    },
    orderBy: { sequence: "asc" },
    take: DEFAULT_LIST_LIMIT,
  },
  // Integrity warning timeline: capped because a hostile client could otherwise
  // flood the reviewer payload with supporting (uncounted) signals.
  integrityEvents: {
    select: {
      id: true,
      clientEventId: true,
      type: true,
      detectedAt: true,
      returnedAt: true,
      durationMs: true,
      counted: true,
      reason: true,
    },
    orderBy: { detectedAt: "asc" },
    take: 100,
  },
};

interface ModuleRef {
  id: string;
  title: string;
  moduleType: string;
}

/**
 * Reviewer-facing evidence trail: every question the candidate was asked, who
 * asked it, what they answered, and whether that answer actually reached the
 * scoring pipeline.
 */
@Injectable()
export class TranscriptService {
  constructor(private readonly prisma: TranscriptPrismaClient) {}

  async getTranscript(sessionId: string, access?: AccessContext): Promise<SessionTranscriptDto> {
    const where = mergeWhere({ id: sessionId }, buildSessionOwnershipWhere(access));
    const session = await this.prisma.interviewSession.findFirst({
      relationLoadStrategy: "join",
      where,
      include: TRANSCRIPT_SESSION_INCLUDE,
    });
    if (!session) throw forbiddenResourceError("Session");

    return {
      ...buildTranscript(session, await this.loadSourceTotals(session, where)),
      canManageFollowUps: canManageSessionFollowUps(session, access),
    };
  }

  /**
   * A source that came back full almost always has more rows behind it. Only then
   * are the totals worth a second query, and they turn "some lines are missing"
   * into a number the reviewer can act on.
   */
  private async loadSourceTotals(
    session: TranscriptSessionRow,
    where: Record<string, unknown> | undefined,
  ): Promise<TranscriptSourceTotals | undefined> {
    const loaded = countSourceRows(session);
    if (!TRANSCRIPT_SOURCE_KEYS.some((key) => loaded[key] >= DEFAULT_LIST_LIMIT)) return undefined;

    const counted = await this.prisma.interviewSession.findFirst({
      where,
      select: {
        _count: { select: { responses: true, aiMessages: true, codeSubmissions: true, interviewerFollowUps: true } },
      },
    });
    return counted?._count ?? undefined;
  }
}

export function buildTranscript(session: TranscriptSessionRow, totals?: TranscriptSourceTotals): SessionTranscriptDto {
  const modules = session.template?.modules ?? [];
  const responses = session.responses ?? [];
  const context: TranscriptContext = {
    moduleById: buildModuleIndex(modules, responses),
    questionById: buildQuestionIndex(modules),
    // Mirrors the report pipeline: a follow-up's parent question resolves to a
    // module only through an answer the candidate actually saved.
    moduleIdByAnsweredQuestion: buildAnsweredQuestionIndex(responses),
    aiModule: modules.map(toModuleRef).find((module) => module.moduleType === "ai_interview"),
    codingModule: modules.map(toModuleRef).find((module) => module.moduleType === "coding"),
  };

  const embeddedFollowUps = collectEmbeddedFollowUps(responses, context);
  const basedOnQuestion = basedOnQuestionByAssistantId(session.aiMessages ?? []);
  const drafts = [
    ...buildTemplateEntries(responses),
    ...buildAdaptiveEntries(session.aiMessages ?? [], responses, embeddedFollowUps, basedOnQuestion, context),
    ...buildFollowUpEntries(session.interviewerFollowUps ?? [], context),
    ...buildCodeEntries(session.codeSubmissions ?? [], context),
  ];

  const entries = orderEntries(drafts);

  return {
    sessionId: session.id,
    status: fromPrismaSessionStatus(session.status),
    startedAt: isoString(session.startedAt),
    completedAt: isoString(session.completedAt),
    candidate: {
      id: optionalString(session.candidate?.id) ?? session.candidateId,
      name: optionalString(session.candidate?.name) ?? "Unknown Candidate",
      email: optionalString(session.candidate?.email) ?? "",
    },
    templateTitle: optionalString(session.template?.title),
    entries,
    counts: countByOrigin(entries),
    truncation: buildTruncation(session, DEFAULT_LIST_LIMIT, totals),
    warningCount: session.warningCount ?? 0,
    warningLimit: session.warningLimit ?? 2,
    integrityEvents: (session.integrityEvents ?? []).map(toTranscriptIntegrityEvent),
  };
}

interface TranscriptContext {
  moduleById: Map<string, ModuleRef>;
  questionById: Map<string, { questionText: string; module?: ModuleRef }>;
  moduleIdByAnsweredQuestion: Map<string, string>;
  aiModule?: ModuleRef;
  codingModule?: ModuleRef;
}

/** Template questions the candidate answered. This is the core scored evidence. */
function buildTemplateEntries(responses: TranscriptResponseRow[]): TranscriptEntryDraft[] {
  const drafts: TranscriptEntryDraft[] = [];

  for (const response of responses) {
    const question = response.question;
    if (!question) continue;
    const module = question.module ? toModuleRef(question.module) : undefined;
    // Only the candidate's own words belong under their answer; an AI follow-up
    // stored in the same column is split out into its own labelled entry.
    const answerText = splitEmbeddedFollowUp(response.responseText).answerText;
    // A template can be reworded at any time, so the live row says what the next
    // candidate will be asked, not what this one answered. The frozen copy wins
    // where there is one; answers saved before snapshots existed have none and
    // still read live.
    const snapshotText = snapshotQuestionText(response);
    drafts.push({
      id: response.id,
      origin: "template",
      questionId: question.id,
      moduleId: module?.id,
      moduleTitle: module?.title,
      moduleType: module?.moduleType,
      questionText: snapshotText ?? question.questionText,
      questionTextIsSnapshot: snapshotText !== undefined,
      // Surfaced rather than resolved: only the reviewer can judge whether the
      // rewrite changed what the answer was supposed to cover.
      liveQuestionText:
        snapshotText !== undefined && snapshotText !== question.questionText
          ? optionalString(question.questionText)
          : undefined,
      answerText,
      answeredAt: isoString(response.createdAt),
      // Scoring groups answers by their question's module and drops empty text.
      isEvidence: Boolean(answerText && module),
      orderedAt: timeValue(response.createdAt),
    });
  }

  return drafts;
}

/**
 * The AI conversation. Two different writers land in `aiMessages` and they do not
 * share a shape: an adaptive answer is a `candidate` message whose
 * `metadata.question` repeats the AI question it answers, while a mid-module
 * follow-up writes a `candidate` message holding the answer to the TEMPLATE
 * question followed by an `assistant` message holding the newly generated AI
 * question. Pairing therefore goes by question wording rather than by adjacency;
 * reading the pair positionally attributes the template question to the AI and
 * leaves the AI's own question looking unanswered.
 *
 * An adaptive answer is scored only once it has been saved as a session response;
 * a probe that was never persisted that way is shown as context, not evidence.
 */
function buildAdaptiveEntries(
  messages: TranscriptAiMessageRow[],
  responses: TranscriptResponseRow[],
  embeddedFollowUps: EmbeddedFollowUp[],
  basedOnQuestion: Map<string, string>,
  context: TranscriptContext,
): TranscriptEntryDraft[] {
  const adaptiveResponses = responses.filter((response) => !response.question && isAdaptive(response.responseJson));
  const scoredByQuestionId = new Map<string, TranscriptResponseRow>();
  const scoredByQuestionText = new Map<string, TranscriptResponseRow>();
  for (const response of adaptiveResponses) {
    const questionId = metadataString(response.responseJson, "questionId");
    const questionText = metadataString(response.responseJson, "question");
    if (questionId) scoredByQuestionId.set(questionId, response);
    if (questionText) scoredByQuestionText.set(questionText, response);
  }

  const askedQuestions = new Set(messages.filter((message) => message.role === "assistant").map((message) => message.content));
  // Both wordings count: a chat message repeats the question as it was ASKED, so
  // a template edited since then would no longer match its own saved answer and
  // the answer would be replayed a second time under the AI's name.
  const savedTemplateQuestions = new Set(
    responses
      .flatMap((response) =>
        response.question ? [response.question.questionText, snapshotQuestionText(response)] : [],
      )
      .filter((text): text is string => Boolean(text)),
  );

  const answerByQuestion = new Map<string, TranscriptAiMessageRow>();
  // Every save of an adaptive answer writes a NEW row rather than updating the
  // last one, so one question commonly holds several rows that differ only by
  // how far the candidate had got. Rows arrive oldest-first, so keeping the last
  // one per question yields the answer they actually left behind; replaying the
  // superseded drafts would repeat the same question at a reviewer several times.
  const unpairedByQuestion = new Map<string, TranscriptAiMessageRow>();
  // An answer naming no question cannot be collapsed with any other, and is held
  // apart rather than given a synthetic key a real question could collide with.
  const unlabelledAnswers: TranscriptAiMessageRow[] = [];
  for (const message of messages) {
    if (message.role === "assistant") continue;
    const questionText = metadataString(message.metadata, "question");
    if (questionText && askedQuestions.has(questionText)) {
      answerByQuestion.set(questionText, message);
      continue;
    }
    // The answer names a template question, so the template entry already carries
    // it. Anything else is kept rather than dropped: losing a candidate's words is
    // worse than showing one under a vague heading.
    if (!questionText) unlabelledAnswers.push(message);
    else if (!savedTemplateQuestions.has(questionText)) unpairedByQuestion.set(questionText, message);
  }
  const unpairedAnswers = [...unpairedByQuestion.values(), ...unlabelledAnswers];

  const embeddedByQuestion = new Map<string, EmbeddedFollowUp>();
  const embeddedByParentQuestion = new Map<string, EmbeddedFollowUp>();
  for (const followUp of embeddedFollowUps) {
    if (followUp.questionText && !embeddedByQuestion.has(followUp.questionText)) {
      embeddedByQuestion.set(followUp.questionText, followUp);
    }
    if (followUp.parentQuestionText && !embeddedByParentQuestion.has(followUp.parentQuestionText)) {
      embeddedByParentQuestion.set(followUp.parentQuestionText, followUp);
    }
  }

  // Questions whose answer lives in a saved response instead of a chat message.
  const answeredAdaptiveQuestions = new Set(
    adaptiveResponses
      .map((response) => metadataString(response.responseJson, "question"))
      .filter((text): text is string => Boolean(text)),
  );

  const drafts: TranscriptEntryDraft[] = [];
  const consumedResponseIds = new Set<string>();
  const pairedQuestions = new Set<string>();

  for (const message of messages) {
    if (message.role !== "assistant") continue;

    const answer = pairedQuestions.has(message.content) ? undefined : answerByQuestion.get(message.content);
    if (answer) {
      pairedQuestions.add(message.content);
      const scored = scoredResponseFor(answer.metadata, scoredByQuestionId, scoredByQuestionText);
      if (scored) consumedResponseIds.add(scored.id);
      drafts.push({
        ...moduleFields(context.aiModule),
        id: answer.id,
        origin: "ai_adaptive",
        questionId: metadataString(message.metadata, "questionId"),
        questionText: message.content,
        answerText: optionalString(answer.content),
        askedAt: isoString(message.createdAt),
        answeredAt: isoString(answer.createdAt),
        // Adaptive answers are folded into the AI-interview module, so without one
        // they are never scored.
        isEvidence: Boolean(scored && context.aiModule),
        orderedAt: timeValue(answer.createdAt),
      });
      continue;
    }

    const embedded = pairedQuestions.has(message.content) ? undefined : embeddedByQuestion.get(message.content);
    if (embedded) {
      pairedQuestions.add(message.content);
      consumedResponseIds.add(embedded.responseId);
      drafts.push(embeddedFollowUpDraft(embedded, message, context));
      continue;
    }

    const parentQuestion = basedOnQuestion.get(message.id);
    const structured = parentQuestion ? embeddedByParentQuestion.get(parentQuestion) : undefined;
    if (structured && !consumedResponseIds.has(structured.responseId)) {
      pairedQuestions.add(message.content);
      consumedResponseIds.add(structured.responseId);
      drafts.push(embeddedFollowUpDraft(
        { ...structured, questionText: message.content },
        message,
        context,
      ));
      continue;
    }

    // The answer to this probe was written as a saved response rather than a chat
    // message, so it is carried by the pass over adaptiveResponses below. Emitting
    // the probe here as well would show the same question twice — once marked
    // unanswered next to the copy holding the candidate's actual answer.
    if (answeredAdaptiveQuestions.has(message.content)) continue;

    // The deterministic fallback asks one fixed question, so it can be issued more
    // than once in a session. The first ask already carries the answer; repeating
    // it here as "unanswered" would read as a question the candidate ignored.
    if (pairedQuestions.has(message.content)) continue;

    // A genuinely unanswered probe still belongs in the record so a reviewer can
    // see what the candidate walked away from.
    drafts.push({
      ...moduleFields(context.aiModule),
      id: message.id,
      origin: "ai_adaptive",
      questionId: metadataString(message.metadata, "questionId"),
      questionText: message.content,
      askedAt: isoString(message.createdAt),
      isEvidence: false,
      orderedAt: timeValue(message.createdAt),
    });
  }

  for (const message of unpairedAnswers) {
    const questionText = metadataString(message.metadata, "question");
    const scored = scoredResponseFor(message.metadata, scoredByQuestionId, scoredByQuestionText);
    if (scored) consumedResponseIds.add(scored.id);
    drafts.push({
      ...moduleFields(context.aiModule),
      id: message.id,
      origin: "ai_adaptive",
      questionId: metadataString(message.metadata, "questionId"),
      questionText: questionText ?? "AI interview question",
      answerText: optionalString(message.content),
      answeredAt: isoString(message.createdAt),
      isEvidence: Boolean(scored && context.aiModule),
      orderedAt: timeValue(message.createdAt),
    });
  }

  // A follow-up whose chat message was pruned still has the candidate's answer in
  // the parent response, so it is shown without an asked-at time.
  for (const followUp of embeddedFollowUps) {
    if (consumedResponseIds.has(followUp.responseId)) continue;
    consumedResponseIds.add(followUp.responseId);
    drafts.push(embeddedFollowUpDraft(followUp, undefined, context));
  }

  // A saved adaptive answer whose chat message was pruned would otherwise vanish
  // from the transcript while still counting toward the score.
  //
  // Autosave appends a row per snapshot rather than updating one, so a single
  // question routinely holds a row for "I", "I d", "I do not know". Rows arrive
  // oldest-first, so the last one per question is the answer the candidate left;
  // replaying the snapshots would show a reviewer the same question many times
  // with visibly half-typed answers.
  const latestAdaptiveByQuestion = new Map<string, TranscriptResponseRow>();
  // Held apart rather than keyed by a synthetic string a real question could equal.
  const unlabelledAdaptive: TranscriptResponseRow[] = [];
  for (const response of adaptiveResponses) {
    if (consumedResponseIds.has(response.id)) continue;
    const questionText = metadataString(response.responseJson, "question");
    // The chat message for this question was already paired into an entry above.
    // Only one of that question's several saved rows is reachable as the "scored"
    // row, so the rest arrive here and would each repeat an answer already shown.
    if (questionText && pairedQuestions.has(questionText)) continue;
    if (!questionText) unlabelledAdaptive.push(response);
    else latestAdaptiveByQuestion.set(questionText, response);
  }

  const adaptiveLeftovers: Array<[string | undefined, TranscriptResponseRow]> = [
    ...latestAdaptiveByQuestion.entries(),
    ...unlabelledAdaptive.map((response) => [undefined, response] as [undefined, TranscriptResponseRow]),
  ];

  for (const [questionText, response] of adaptiveLeftovers) {
    drafts.push({
      ...moduleFields(context.aiModule),
      id: response.id,
      origin: "ai_adaptive",
      questionId: metadataString(response.responseJson, "questionId"),
      questionText: questionText ?? "AI interview question",
      answerText: adaptiveAnswerText(response.responseText),
      answeredAt: isoString(response.createdAt),
      isEvidence: Boolean(context.aiModule),
      orderedAt: timeValue(response.createdAt),
    });
  }

  return drafts;
}

function scoredResponseFor(
  metadata: unknown,
  byQuestionId: Map<string, TranscriptResponseRow>,
  byQuestionText: Map<string, TranscriptResponseRow>,
): TranscriptResponseRow | undefined {
  const questionId = metadataString(metadata, "questionId");
  const questionText = metadataString(metadata, "question");
  return (questionId ? byQuestionId.get(questionId) : undefined)
    ?? (questionText ? byQuestionText.get(questionText) : undefined);
}

function embeddedFollowUpDraft(
  followUp: EmbeddedFollowUp,
  message: TranscriptAiMessageRow | undefined,
  context: TranscriptContext,
): TranscriptEntryDraft {
  return {
    ...moduleFields(followUp.module ?? context.aiModule),
    // The answer has no row of its own: it lives inside the parent response.
    id: `${followUp.responseId}:ai-follow-up`,
    origin: "ai_adaptive",
    questionId: metadataString(message?.metadata, "questionId")
      ?? (followUp.parentQuestionId ? `ai-follow-up:${followUp.parentQuestionId}` : undefined),
    questionText: followUp.questionText ?? "AI follow-up question",
    answerText: followUp.answerText,
    askedAt: isoString(message?.createdAt),
    answeredAt: isoString(followUp.answeredAt),
    // The scorer reads the parent response whole, so this answer already counted
    // toward the module the parent question belongs to — but only if it exists.
    isEvidence: Boolean(followUp.module && followUp.answerText),
    orderedAt: timeValue(followUp.answeredAt ?? message?.createdAt),
  };
}

/**
 * Human follow-ups. The interviewer's own wording is attributed to them and is
 * never evidence; only a submitted answer that lands in a module is scored.
 */
function buildFollowUpEntries(followUps: TranscriptFollowUpRow[], context: TranscriptContext): TranscriptEntryDraft[] {
  return followUps.map((followUp) => {
    const status = fromPrismaFollowUpStatus(followUp.status);
    const parentQuestionId = optionalString(followUp.parentQuestionId);
    const moduleId = optionalString(followUp.moduleId)
      ?? (parentQuestionId ? context.moduleIdByAnsweredQuestion.get(parentQuestionId) : undefined);
    const module = moduleId ? context.moduleById.get(moduleId) : undefined;
    const answerText = optionalString(followUp.answerText);

    return {
      id: followUp.id,
      origin: "interviewer_follow_up" as const,
      parentQuestionId,
      moduleId: module?.id ?? moduleId,
      moduleTitle: module?.title,
      moduleType: module?.moduleType,
      questionText: followUp.questionText,
      answerText,
      askedBy: {
        id: optionalString(followUp.askedBy?.id),
        name: optionalString(followUp.askedBy?.name) ?? "Interviewer",
      },
      askedAt: isoString(followUp.sentAt),
      answeredAt: isoString(followUp.answeredAt),
      status,
      // A withdrawn question and an unsent draft never reach the scorer, and the
      // question text itself is context on any status. The report also drops a
      // follow-up whose module no longer exists, so a dangling moduleId is not
      // enough to claim the answer was scored.
      isEvidence: status === "answered" && Boolean(answerText) && Boolean(module),
      orderedAt: timeValue(followUp.answeredAt ?? followUp.sentAt),
    };
  });
}

/** Code the candidate actually ran, with the sandbox output the score was based on. */
function buildCodeEntries(submissions: TranscriptCodeSubmissionRow[], context: TranscriptContext): TranscriptEntryDraft[] {
  // Scoring keeps one submission per question (the last one), so earlier attempts
  // are history rather than evidence.
  const latestIdByQuestion = new Map<string, string>();
  for (const submission of submissions) {
    latestIdByQuestion.set(submission.questionId, submission.id);
  }

  return submissions.map((submission) => {
    const question = context.questionById.get(submission.questionId);
    const module = question?.module ?? context.codingModule;

    return {
      ...moduleFields(module),
      id: submission.id,
      origin: "code_submission" as const,
      questionId: submission.questionId,
      questionText: question?.questionText ?? "Coding challenge",
      answeredAt: isoString(submission.createdAt),
      code: {
        language: submission.language,
        sourceCode: submission.sourceCode,
        stdout: optionalString(submission.stdout),
        // Compile failures never reach stderr, and a reviewer needs to see why a
        // run produced nothing.
        stderr: optionalString(submission.stderr) ?? optionalString(submission.compileOutput),
        testResults: submission.testResults ?? undefined,
      },
      isEvidence: Boolean(context.codingModule) && latestIdByQuestion.get(submission.questionId) === submission.id,
      orderedAt: timeValue(submission.createdAt),
    };
  });
}

function orderEntries(drafts: TranscriptEntryDraft[]): TranscriptEntry[] {
  return drafts
    .map((draft, index) => ({ draft, index }))
    .sort(
      (a, b) =>
        a.draft.orderedAt - b.draft.orderedAt
        || TRANSCRIPT_ORIGIN_RANK[a.draft.origin] - TRANSCRIPT_ORIGIN_RANK[b.draft.origin]
        || a.index - b.index,
    )
    .map(({ draft }, position) => toEntry(draft, position + 1));
}

/** `orderedAt` orders the drafts and must not reach the reviewer's response. */
function toEntry(draft: TranscriptEntryDraft, sequence: number): TranscriptEntry {
  const entry: TranscriptEntry & { orderedAt?: number } = {
    ...draft,
    // Every other origin quotes wording that was never stored on a template row,
    // so it is always live by definition.
    questionTextIsSnapshot: draft.questionTextIsSnapshot === true,
    sequence,
  };
  delete entry.orderedAt;
  return entry;
}

/**
 * Modules a follow-up can be scored against. The report builds one bucket per
 * template module plus any module reached through an answered question, and
 * silently drops a follow-up that resolves to neither.
 */
function buildModuleIndex(modules: TranscriptModuleRow[], responses: TranscriptResponseRow[]): Map<string, ModuleRef> {
  const index = new Map(modules.map((module) => [module.id, toModuleRef(module)]));
  for (const response of responses) {
    const module = response.question?.module;
    if (module && !index.has(module.id)) index.set(module.id, toModuleRef(module));
  }
  return index;
}

function buildQuestionIndex(modules: TranscriptModuleRow[]): Map<string, { questionText: string; module?: ModuleRef }> {
  const index = new Map<string, { questionText: string; module?: ModuleRef }>();
  for (const module of modules) {
    for (const question of module.questions ?? []) {
      index.set(question.id, { questionText: question.questionText, module: toModuleRef(module) });
    }
  }
  return index;
}

function buildAnsweredQuestionIndex(responses: TranscriptResponseRow[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const response of responses) {
    const questionId = optionalString(response.question?.id);
    const moduleId = optionalString(response.question?.module?.id);
    if (questionId && moduleId) index.set(questionId, moduleId);
  }
  return index;
}

function moduleFields(module?: ModuleRef) {
  return { moduleId: module?.id, moduleTitle: module?.title, moduleType: module?.moduleType };
}

function toTranscriptIntegrityEvent(event: TranscriptIntegrityEventRow): TranscriptIntegrityEvent {
  const asDate = (value?: Date | string | null) => (value instanceof Date ? value : value ? new Date(value) : undefined);
  return {
    id: event.id,
    clientEventId: event.clientEventId,
    type: event.type,
    detectedAt: isoString(asDate(event.detectedAt)) ?? String(event.detectedAt),
    returnedAt: isoString(asDate(event.returnedAt)),
    durationMs: event.durationMs ?? undefined,
    counted: event.counted,
    reason: event.reason,
  };
}

function toModuleRef(module: { id: string; title: string; moduleType: string }): ModuleRef {
  return { id: module.id, title: module.title, moduleType: module.moduleType.toLowerCase() };
}

/** An AI follow-up recovered from the parent response it was stored inside. */
interface EmbeddedFollowUp {
  responseId: string;
  parentQuestionId?: string;
  questionText?: string;
  parentQuestionText?: string;
  /** Absent while the candidate has been asked but has not written anything yet. */
  answerText?: string;
  module?: ModuleRef;
  answeredAt?: Date | null;
}

function collectEmbeddedFollowUps(responses: TranscriptResponseRow[], context: TranscriptContext): EmbeddedFollowUp[] {
  const followUps: EmbeddedFollowUp[] = [];

  for (const response of responses) {
    const question = response.question;
    const legacy = splitEmbeddedFollowUp(response.responseText).followUp;
    const structured = readStructuredAiFollowUp(response.responseJson);
    const followUp = legacy ?? structured;
    if (!followUp) continue;
    const adaptive = isAdaptive(response.responseJson);
    if (!question && !adaptive) continue;
    followUps.push({
      responseId: response.id,
      parentQuestionId: question?.id ?? metadataString(response.responseJson, "questionId"),
      questionText: followUp.questionText,
      answerText: followUp.answerText,
      parentQuestionText: snapshotQuestionText(response)
        ?? question?.questionText
        ?? metadataString(response.responseJson, "question"),
      module: question?.module ? toModuleRef(question.module) : (adaptive ? context.aiModule : undefined),
      answeredAt: response.createdAt,
    });
  }

  return followUps;
}

// splitEmbeddedFollowUp now lives in common/embedded-follow-up so the report
// scorer and this transcript read the stored format through one parser.


/** Adaptive answers are stored as `AI interview - <question>\n\nResponse: <answer>`. */
function adaptiveAnswerText(responseText: string): string | undefined {
  const marker = "\n\nResponse: ";
  const at = responseText.indexOf(marker);
  return optionalString(at === -1 ? responseText : responseText.slice(at + marker.length));
}

/**
 * The question as the candidate was shown it, frozen onto the answer by
 * responses.service (`responseJson.questionSnapshot`). Absent on free-form
 * answers, on rows written before snapshots existed, and when the lookup failed,
 * so the caller must always be able to fall back to the live template row. A
 * snapshot recorded with no wording at all is treated the same way: it can only
 * make the transcript emptier than reading live.
 */
function snapshotQuestionText(response: TranscriptResponseRow): string | undefined {
  const privateSnapshot = response.questionSnapshot;
  const legacySnapshot = isRecord(response.responseJson) ? response.responseJson.questionSnapshot : undefined;
  const snapshot = isRecord(privateSnapshot) ? privateSnapshot : legacySnapshot;
  return isRecord(snapshot) ? optionalString(snapshot.questionText) : undefined;
}

function isAdaptive(value: unknown): boolean {
  return isRecord(value) && value.adaptive === true;
}

function metadataString(value: unknown, key: string): string | undefined {
  return isRecord(value) ? optionalString(value[key]) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isoString(value?: Date | null): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function timeValue(value?: Date | null): number {
  const date = value instanceof Date ? value : value ? new Date(value) : undefined;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}
