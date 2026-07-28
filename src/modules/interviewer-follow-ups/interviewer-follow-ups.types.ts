export type InterviewerFollowUpStatus = "sent" | "answered" | "cancelled";
export type PrismaInterviewerFollowUpStatus = "SENT" | "ANSWERED" | "CANCELLED";

/** Shape returned to workspace users (interviewers/owners). */
export interface InterviewerFollowUpDto {
  id: string;
  sessionId: string;
  moduleId?: string;
  parentQuestionId?: string;
  questionText: string;
  answerText?: string;
  required: boolean;
  sequence: number;
  status: InterviewerFollowUpStatus;
  askedBy: { id: string; name: string };
  sentAt: string;
  answerSavedAt?: string;
  answeredAt?: string;
  cancelledAt?: string;
}

export interface SendInterviewerFollowUpInput {
  moduleId?: string;
  parentQuestionId?: string;
  questionText?: string;
  required?: boolean;
  idempotencyKey?: string;
}

export interface AnswerInterviewerFollowUpInput {
  answerText?: string;
  /** false (default) autosaves a draft; true submits and locks the answer. */
  submit?: boolean;
}

export interface InterviewerFollowUpRow {
  id: string;
  sessionId: string;
  moduleId?: string | null;
  parentQuestionId?: string | null;
  askedById: string;
  askedBy?: { id?: string | null; name?: string | null } | null;
  questionText: string;
  answerText?: string | null;
  required: boolean;
  sequence: number;
  status: PrismaInterviewerFollowUpStatus;
  sentAt?: Date | null;
  answerSavedAt?: Date | null;
  answeredAt?: Date | null;
  cancelledAt?: Date | null;
}

export const QUESTION_TEXT_MIN = 3;
export const QUESTION_TEXT_MAX = 2_000;
export const ANSWER_TEXT_MAX = 12_000;

export function toInterviewerFollowUpDto(row: InterviewerFollowUpRow): InterviewerFollowUpDto {
  return {
    id: row.id,
    sessionId: row.sessionId,
    moduleId: row.moduleId ?? undefined,
    parentQuestionId: row.parentQuestionId ?? undefined,
    questionText: row.questionText,
    answerText: row.answerText ?? undefined,
    required: row.required,
    sequence: row.sequence,
    status: fromPrismaStatus(row.status),
    askedBy: { id: row.askedBy?.id ?? row.askedById, name: row.askedBy?.name ?? "Interviewer" },
    sentAt: isoString(row.sentAt) ?? new Date(0).toISOString(),
    answerSavedAt: isoString(row.answerSavedAt),
    answeredAt: isoString(row.answeredAt),
    cancelledAt: isoString(row.cancelledAt),
  };
}

/** Candidate-facing projection: never exposes interviewer-only metadata. */
export function toCandidateFollowUpDto(row: InterviewerFollowUpRow): Omit<InterviewerFollowUpDto, "askedBy"> & {
  askedBy: { name: string };
} {
  const dto = toInterviewerFollowUpDto(row);
  return { ...dto, askedBy: { name: dto.askedBy.name } };
}

export function fromPrismaStatus(status: PrismaInterviewerFollowUpStatus): InterviewerFollowUpStatus {
  return status.toLowerCase() as InterviewerFollowUpStatus;
}

function isoString(value?: Date | null): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
