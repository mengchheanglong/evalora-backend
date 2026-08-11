import type { SessionStatus } from "../../domain/evalora.types";

/**
 * Where a line of the transcript came from. Provenance is structural (a field a
 * reviewer can filter on), never a sentence glued into the question or answer
 * text, so an interviewer's own wording can never be mistaken for the
 * candidate's.
 */
export type TranscriptOrigin = "template" | "ai_adaptive" | "interviewer_follow_up" | "code_submission";

export type TranscriptFollowUpStatus = "sent" | "answered" | "cancelled";

export interface TranscriptCodeArtifact {
  language: string;
  sourceCode: string;
  stdout?: string;
  stderr?: string;
  testResults?: unknown;
}

export interface TranscriptEntry {
  id: string;
  origin: TranscriptOrigin;
  /** Template question this answer belongs to; used for live interviewer follow-ups. */
  questionId?: string;
  /** Interviewer follow-ups only: the template question that prompted this thread. */
  parentQuestionId?: string;
  moduleId?: string;
  moduleTitle?: string;
  moduleType?: string;
  /** 1-based position in `entries`, so a reviewer can cite "line 7" of a transcript. */
  sequence: number;
  questionText: string;
  /**
   * True when `questionText` is the frozen copy stored on the answer instead of
   * the template row read live, i.e. the wording the candidate was actually
   * shown. Only a template answer can carry one, and only if it was saved after
   * snapshots existed; every other line reads live and reports false.
   */
  questionTextIsSnapshot: boolean;
  /**
   * The template's wording today, carried only when it no longer matches the
   * snapshot above. Its presence is the signal that the question was edited
   * after this answer was given, which a reviewer has to see before judging the
   * answer against it.
   */
  liveQuestionText?: string;
  answerText?: string;
  /** Interviewer follow-ups only: the human who asked. */
  askedBy?: { id?: string; name: string };
  askedAt?: string;
  answeredAt?: string;
  /** Interviewer follow-ups only. */
  status?: TranscriptFollowUpStatus;
  code?: TranscriptCodeArtifact;
  /**
   * True when this entry's ANSWER reached the scoring pipeline as candidate
   * evidence. It never describes `questionText`: a question is context, and an
   * interviewer's question wording is never scored as something the candidate said.
   */
  isEvidence: boolean;
}

export interface TranscriptCounts {
  template: number;
  aiAdaptive: number;
  interviewerFollowUp: number;
  codeSubmission: number;
}

/** The four database relations a transcript is assembled from. */
export const TRANSCRIPT_SOURCE_KEYS = ["responses", "aiMessages", "codeSubmissions", "interviewerFollowUps"] as const;

export type TranscriptSourceKey = (typeof TRANSCRIPT_SOURCE_KEYS)[number];

export type TranscriptSourceCounts = Record<TranscriptSourceKey, number>;

/** Row totals per source, read only when a source came back full. */
export type TranscriptSourceTotals = Partial<TranscriptSourceCounts>;

/**
 * Each source is read one capped page at a time, so a long session holds more
 * rows than a transcript can carry. A trail presented to a reviewer as complete
 * evidence must never quietly stop short, so the shortfall is stated instead.
 */
export interface TranscriptTruncation {
  /** True when at least one source was cut off; `entries` is then incomplete. */
  truncated: boolean;
  /** Rows read per source before the cut-off applied. */
  limit: number;
  /** Rows left out per source; 0 when nothing was dropped or the total is unknown. */
  omitted: TranscriptSourceCounts;
}

export interface TranscriptIntegrityEvent {
  id: string;
  clientEventId: string;
  type: string;
  detectedAt: string;
  returnedAt?: string;
  durationMs?: number;
  counted: boolean;
  reason: string;
}

export interface SessionTranscriptDto {
  sessionId: string;
  status: SessionStatus;
  canManageFollowUps?: boolean;
  startedAt?: string;
  completedAt?: string;
  candidate: { id: string; name: string; email: string };
  templateTitle?: string;
  entries: TranscriptEntry[];
  counts: TranscriptCounts;
  truncation: TranscriptTruncation;
  /** Official integrity warning summary + timeline for the reviewer UI. */
  warningCount?: number;
  warningLimit?: number;
  integrityEvents?: TranscriptIntegrityEvent[];
}

/**
 * Sequence is assigned after the flat list is ordered, so drafts carry a sort key
 * instead. Only the template builder can know whether it read a snapshot, so the
 * flag is optional here and defaulted once the entry is built.
 */
export type TranscriptEntryDraft = Omit<TranscriptEntry, "sequence" | "questionTextIsSnapshot"> & {
  questionTextIsSnapshot?: boolean;
  orderedAt: number;
};

type PrismaSessionStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED";
type PrismaInterviewerFollowUpStatus = "SENT" | "ANSWERED" | "CANCELLED";

export interface TranscriptModuleRow {
  id: string;
  title: string;
  moduleType: string;
  orderIndex?: number;
  questions?: Array<{ id: string; questionText: string }> | null;
}

export interface TranscriptResponseRow {
  id: string;
  responseText: string;
  responseJson?: unknown;
  questionSnapshot?: unknown;
  createdAt?: Date | null;
  question?: {
    id: string;
    questionText: string;
    module?: { id: string; title: string; moduleType: string } | null;
  } | null;
}

export interface TranscriptAiMessageRow {
  id: string;
  role: string;
  content: string;
  metadata?: unknown;
  createdAt?: Date | null;
}

export interface TranscriptCodeSubmissionRow {
  id: string;
  questionId: string;
  language: string;
  sourceCode: string;
  stdout?: string | null;
  stderr?: string | null;
  compileOutput?: string | null;
  testResults?: unknown;
  createdAt?: Date | null;
}

export interface TranscriptFollowUpRow {
  id: string;
  moduleId?: string | null;
  parentQuestionId?: string | null;
  questionText: string;
  answerText?: string | null;
  sequence: number;
  status: PrismaInterviewerFollowUpStatus;
  sentAt?: Date | null;
  answeredAt?: Date | null;
  askedBy?: { id?: string | null; name?: string | null } | null;
}

export interface TranscriptIntegrityEventRow {
  id: string;
  clientEventId: string;
  type: string;
  detectedAt: Date | string;
  returnedAt?: Date | string | null;
  durationMs?: number | null;
  counted: boolean;
  reason: string;
}

export interface TranscriptSessionRow {
  id: string;
  candidateId: string;
  createdById?: string | null;
  interviewers?: unknown;
  status: PrismaSessionStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
  candidate?: { id?: string | null; name?: string | null; email?: string | null } | null;
  template?: { title?: string | null; modules?: TranscriptModuleRow[] | null } | null;
  responses?: TranscriptResponseRow[] | null;
  aiMessages?: TranscriptAiMessageRow[] | null;
  codeSubmissions?: TranscriptCodeSubmissionRow[] | null;
  interviewerFollowUps?: TranscriptFollowUpRow[] | null;
  integrityEvents?: TranscriptIntegrityEventRow[] | null;
  warningCount?: number;
  warningLimit?: number;
  /** Present only on the follow-up count query, never on the main read. */
  _count?: TranscriptSourceTotals | null;
}

/** Stable tie-break when two entries share a timestamp (bulk-seeded rows do). */
export const TRANSCRIPT_ORIGIN_RANK: Record<TranscriptOrigin, number> = {
  template: 0,
  ai_adaptive: 1,
  interviewer_follow_up: 2,
  code_submission: 3,
};

export function fromPrismaSessionStatus(status: PrismaSessionStatus): SessionStatus {
  return status.toLowerCase() as SessionStatus;
}

export function fromPrismaFollowUpStatus(status: PrismaInterviewerFollowUpStatus): TranscriptFollowUpStatus {
  return status.toLowerCase() as TranscriptFollowUpStatus;
}

export function countByOrigin(entries: TranscriptEntry[]): TranscriptCounts {
  return {
    template: entries.filter((entry) => entry.origin === "template").length,
    aiAdaptive: entries.filter((entry) => entry.origin === "ai_adaptive").length,
    interviewerFollowUp: entries.filter((entry) => entry.origin === "interviewer_follow_up").length,
    codeSubmission: entries.filter((entry) => entry.origin === "code_submission").length,
  };
}

export function countSourceRows(session: TranscriptSessionRow): TranscriptSourceCounts {
  return {
    responses: session.responses?.length ?? 0,
    aiMessages: session.aiMessages?.length ?? 0,
    codeSubmissions: session.codeSubmissions?.length ?? 0,
    interviewerFollowUps: session.interviewerFollowUps?.length ?? 0,
  };
}

export function buildTruncation(
  session: TranscriptSessionRow,
  limit: number,
  totals?: TranscriptSourceTotals,
): TranscriptTruncation {
  const loaded = countSourceRows(session);
  const omitted = {} as TranscriptSourceCounts;
  for (const key of TRANSCRIPT_SOURCE_KEYS) {
    const total = totals?.[key];
    omitted[key] = typeof total === "number" && total > loaded[key] ? total - loaded[key] : 0;
  }

  return {
    // A source that came back full was cut off even when the exact shortfall
    // could not be read, so the reviewer is still warned.
    truncated: TRANSCRIPT_SOURCE_KEYS.some((key) => loaded[key] >= limit || omitted[key] > 0),
    limit,
    omitted,
  };
}
