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
  moduleId?: string;
  moduleTitle?: string;
  moduleType?: string;
  /** 1-based position in `entries`, so a reviewer can cite "line 7" of a transcript. */
  sequence: number;
  questionText: string;
  answerText?: string;
  /** Interviewer follow-ups only: the human who asked. */
  askedBy?: { name: string };
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

export interface SessionTranscriptDto {
  sessionId: string;
  status: SessionStatus;
  startedAt?: string;
  completedAt?: string;
  candidate: { id: string; name: string; email: string };
  templateTitle?: string;
  entries: TranscriptEntry[];
  counts: TranscriptCounts;
  truncation: TranscriptTruncation;
}

/** Sequence is assigned after the flat list is ordered, so drafts carry a sort key instead. */
export type TranscriptEntryDraft = Omit<TranscriptEntry, "sequence"> & { orderedAt: number };

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
  askedBy?: { name?: string | null } | null;
}

export interface TranscriptSessionRow {
  id: string;
  candidateId: string;
  status: PrismaSessionStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
  candidate?: { id?: string | null; name?: string | null; email?: string | null } | null;
  template?: { title?: string | null; modules?: TranscriptModuleRow[] | null } | null;
  responses?: TranscriptResponseRow[] | null;
  aiMessages?: TranscriptAiMessageRow[] | null;
  codeSubmissions?: TranscriptCodeSubmissionRow[] | null;
  interviewerFollowUps?: TranscriptFollowUpRow[] | null;
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
