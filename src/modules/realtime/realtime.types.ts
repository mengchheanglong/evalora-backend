import type { SessionStatus } from "../../domain/evalora.types";

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
 * Returned when a client joins (or re-joins after a dropout).
 * Carries everything needed to rebuild the live view, so no state is lost
 * across a reconnect.
 */
export interface SessionSnapshot {
  sessionId: string;

  /**
   * Lowercase, exactly like every REST DTO and SnapshotFollowUp.status.
   * The raw Prisma enum ("IN_PROGRESS") never reaches a client.
   */
  status: SessionStatus;

  startedAt?: string;
  completedAt?: string;
  participants: InterviewParticipant[];
  followUps: SnapshotFollowUp[];
  serverTime: number;
}

/**
 * How a service hands work to the live transport.
 *
 * Optional wherever it is injected, so services stay unit-testable without
 * a gateway.
 */
export interface InterviewEventPublisher {
  emitToSession(sessionId: string, event: string, payload: unknown): void;
}

/**
 * Single source of truth for event names on both sides of the wire.
 */
export const INTERVIEW_EVENTS = {
  // ------------------------------------------------------------------
  // client -> server
  // ------------------------------------------------------------------

  joinSession: "session.join",
  leaveSession: "session.leave",
  ping: "session.ping",

  // ------------------------------------------------------------------
  // server -> client
  // ------------------------------------------------------------------

  presenceUpdated: "presence.updated",
  sessionUpdated: "session.updated",
  responseSaved: "response.saved",

  questionSent: "interviewer-question.sent",
  questionAnswered: "interviewer-question.answered",
  questionCancelled: "interviewer-question.cancelled",

  error: "session.error",
} as const;
