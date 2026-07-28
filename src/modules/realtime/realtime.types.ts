export type ParticipantRole = "candidate" | "interviewer";

export interface InterviewParticipant {
  userId: string;
  name: string;
  role: ParticipantRole;
}

export interface SnapshotFollowUp {
  id: string;
  questionText: string;
  answerText?: string;
  required: boolean;
  sequence: number;
  status: "sent" | "answered" | "cancelled";
  askedBy: { name: string };
}

/**
 * Returned when a client joins (or re-joins after a dropout). Carries everything
 * needed to rebuild the live view, so no state is lost across a reconnect.
 */
export interface SessionSnapshot {
  sessionId: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  participants: InterviewParticipant[];
  followUps: SnapshotFollowUp[];
  serverTime: number;
}

/** Single source of truth for event names on both sides of the wire. */
export const INTERVIEW_EVENTS = {
  // client -> server
  joinSession: "session.join",
  leaveSession: "session.leave",
  ping: "session.ping",
  // server -> client
  presenceUpdated: "presence.updated",
  sessionUpdated: "session.updated",
  questionSent: "interviewer-question.sent",
  questionAnswered: "interviewer-question.answered",
  questionCancelled: "interviewer-question.cancelled",
  error: "session.error",
} as const;
