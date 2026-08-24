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
 * Returned when a client joins (or re-joins after a dropout). Carries everything
 * needed to rebuild the live view, so no state is lost across a reconnect.
 */
export interface SessionSnapshot {
  sessionId: string;
  /**
   * Lowercase, exactly like every REST DTO and SnapshotFollowUp.status. The raw
   * Prisma enum ("IN_PROGRESS") never reaches a client, so a screen can compare
   * a live status against a fetched one without knowing which channel it came
   * from.
   */
  status: SessionStatus;
  startedAt?: string;
  completedAt?: string;
  participants: InterviewParticipant[];
  followUps: SnapshotFollowUp[];
  serverTime: number;
}

/**
 * How a service hands work to the live transport. It lives with the rest of the
 * realtime contract rather than in one of the services that publishes through
 * it, so every publisher depends on the transport and never on a sibling
 * feature module.
 *
 * Optional wherever it is injected, so services stay unit-testable without a
 * gateway.
 */
export interface InterviewEventPublisher {
  emitToSession(sessionId: string, event: string, payload: unknown): void;
}

/**
 * Server-authored integrity decision. Only the backend writes these values;
 * the candidate browser reports a signal and receives this back.
 */
export interface IntegrityUpdatedEvent {
  sessionId: string;
  warningCount: number;
  warningLimit: number;
  status: SessionStatus;
  /** "warned" | "terminated" | "duplicate" | "recorded" — never client-supplied. */
  action?: string;
  reason: string;
  /** The latest stored event; always present on a counted decision. */
  event?: unknown;
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
  responseSaved: "response.saved",
  questionSent: "interviewer-question.sent",
  questionAnswered: "interviewer-question.answered",
  questionCancelled: "interviewer-question.cancelled",
  integrityUpdated: "integrity.updated",
  integrityPolicyUpdated: "integrity.policy.updated",
  error: "session.error",
} as const;
