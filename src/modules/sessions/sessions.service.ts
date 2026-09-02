import { BadRequestException, ConflictException, GoneException, Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { DEFAULT_LIST_LIMIT } from "../../common/query.constants";
import type { AssessmentTemplateDto, InterviewSessionDto, JsonValue, ModuleType, QuestionType, SessionStatus } from "../../domain/evalora.types";
import { buildSessionOwnershipWhere, buildTemplateOwnershipWhere, forbiddenResourceError, mergeWhere, requireOrganizationId, type AccessContext } from "../auth/access-control";
import type { EmailDeliveryResult, EmailService } from "../email/email.service";
// The publisher contract belongs to the realtime transport, so every service
// fans out through one shared shape instead of look-alike interfaces that drift.
import { INTERVIEW_EVENTS, type InterviewEventPublisher } from "../realtime/realtime.types";
import { storedInterviewerNames, type StoredInterviewerAssignment } from "./interviewer-assignment";
import { ReportIntegrityEventDto, type IntegrityEventType } from "./dto/report-integrity-event.dto";

type PrismaSessionStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED";
type PrismaRole = "ADMIN" | "ORGANIZATION" | "INTERVIEWER" | "CANDIDATE";
type PrismaModuleType = "AI_INTERVIEW" | "CODING" | "DEBUGGING" | "WORK_STYLE" | "BEHAVIORAL" | "LEADERSHIP" | "COMMUNICATION" | "PROBLEM_SOLVING";
type PrismaQuestionType = "MCQ" | "SCALE" | "SHORT_ANSWER" | "CODING" | "SCENARIO" | "ROLEPLAY";

interface SessionUserRow {
  name: string;
  email?: string;
  role?: PrismaRole;
}

interface SessionTemplateRow {
  title: string;
  roleType?: string;
  timeLimitMin?: number | null;
}

interface SessionReportRow {
  overallScore: number;
}

interface SessionCreatorRow {
  id?: string;
  name: string;
  role?: PrismaRole;
}

interface CandidateQuestionRow {
  id: string;
  questionText: string;
  questionType: PrismaQuestionType;
  options?: JsonValue | null;
  rubric?: JsonValue | null;
}

interface CandidateModuleRow {
  id: string;
  moduleType: PrismaModuleType;
  title: string;
  description?: string | null;
  weight: number;
  orderIndex: number;
  settings?: JsonValue | null;
  questions?: CandidateQuestionRow[];
}

interface CandidateTemplateRow extends SessionTemplateRow {
  id: string;
  description?: string | null;
  roleType: string;
  timeLimitMin?: number | null;
  scoringRules?: JsonValue | null;
  createdById?: string;
  organizationId?: string | null;
  modules?: CandidateModuleRow[];
}

interface IntegrityEventRow {
  id: string;
  sessionId: string;
  clientEventId: string;
  type: string;
  detectedAt: Date;
  returnedAt?: Date | null;
  durationMs?: number | null;
  counted: boolean;
  reason: string;
}

/**
 * Transaction-scoped client shape used only for integrity writes, so the
 * service stays unit-testable with a plain object. The real Prisma client
 * satisfies it naturally.
 */
interface IntegrityTxClient {
  integrityEvent: {
    create: (args: any) => Promise<IntegrityEventRow>;
  };
  interviewSession: {
    update: (args: any) => Promise<unknown>;
  };
}

interface SessionRow {
  id: string;
  candidateId: string;
  candidate?: SessionUserRow | null;
  templateId: string;
  template?: SessionTemplateRow | null;
  report?: SessionReportRow | null;
  warningCount?: number;
  warningLimit?: number;
  createdById?: string | null;
  createdBy?: SessionCreatorRow | null;
  title?: string | null;
  interviewType?: string | null;
  interviewers?: JsonValue | null;
  notes?: string | null;
  targetRole?: string | null;
  department?: string | null;
  scheduledAt?: Date | null;
  durationMin?: number | null;
  language?: string | null;
  timeZone?: string | null;
  organizationId?: string | null;
  accessCode: string;
  status: PrismaSessionStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
  expiredAt?: Date | null;
  expiresAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

interface CandidateSessionRow extends Omit<SessionRow, "template"> {
  template?: CandidateTemplateRow | null;
}

interface CandidateUserRow {
  id: string;
  role: PrismaRole;
  name?: string;
  organizationId?: string | null;
}

type SessionCreateFn = (args: any) => Promise<SessionRow>;
type SessionFindManyFn = (args: any) => Promise<SessionRow[]>;
type SessionFindUniqueFn = (args: any) => Promise<SessionRow | null>;
type SessionFindFirstFn = (args: any) => Promise<SessionRow | CandidateSessionRow | null>;
type SessionUpdateFn = (args: any) => Promise<SessionRow | CandidateSessionRow>;
type UserFindUniqueFn = (args: any) => Promise<CandidateUserRow | null>;
type UserFindManyFn = (args: any) => Promise<CandidateUserRow[]>;
type UserCreateFn = (args: any) => Promise<CandidateUserRow>;

interface SessionPrismaClient {
  /** Optional so existing mocks keep working; present on the real client. */
  integrityEvent?: {
    findUnique?: (args: any) => Promise<IntegrityEventRow | null>;
    findMany?: (args: any) => Promise<IntegrityEventRow[]>;
    create?: (args: any) => Promise<IntegrityEventRow>;
  };
  /**
   * Optional so mocks without transaction support keep working; present on the
   * real client. Integrity writes run inside it so an event row and its warning
   * increment can never diverge.
   */
  $transaction?: <T>(fn: (tx: IntegrityTxClient) => Promise<T>) => Promise<T>;
  user?: {
    findUnique?: UserFindUniqueFn;
    findMany?: UserFindManyFn;
    create?: UserCreateFn;
  };
  organization?: {
    findUnique?: (args: any) => Promise<{ name: string } | null>;
  };
  assessmentTemplate?: {
    findFirst?: (args: any) => Promise<{ id: string; organizationId?: string | null } | null>;
  };
  interviewSession: {
    create?: SessionCreateFn;
    findMany?: SessionFindManyFn;
    findUnique?: SessionFindUniqueFn;
    findFirst?: SessionFindFirstFn;
    update?: SessionUpdateFn;
    updateMany?: (args: any) => Promise<{ count: number }>;
    deleteMany?: (args: any) => Promise<{ count: number }>;
  };
  /** Optional so existing mocks keep working; present on the real client. */
  interviewerFollowUp?: {
    count?: (args: any) => Promise<number>;
  };
}

export interface CreateSessionInput {
  candidateId?: string;
  candidateName?: string;
  candidateEmail?: string;
  templateId?: string;
  organizationId?: string;
  expiresAt?: Date | string;
  /** Optional workspace label shown on the sessions list. */
  title?: string;
  interviewType?: string;
  /** Named interviewers (string array). Empty/invalid values are ignored. */
  interviewers?: string[] | string;
  /** Stable workspace user ids used to enforce live follow-up permissions. */
  interviewerIds?: string[];
  notes?: string;
  /** Candidate position/role for this session. */
  targetRole?: string;
  department?: string;
  /** Preferred over sessionDate+startTime when both are sent. */
  scheduledAt?: Date | string;
  sessionDate?: string;
  startTime?: string;
  durationMin?: number | string;
  language?: string;
  timeZone?: string;
}

export interface ListSessionsFilter {
  organizationId?: string;
  candidateId?: string;
  templateId?: string;
  status?: SessionStatus;
}

export interface CandidateAccessSessionDto extends InterviewSessionDto {
  template: AssessmentTemplateDto;
}

/**
 * What the candidate browser is allowed to report. The backend derives every
 * enforcement decision (`counted`, `warningCount`, `status`) from this input;
 * nothing here can force a warning or a session transition.
 */
export interface IntegrityEventInput {
  clientEventId: string;
  type: IntegrityEventType;
  detectedAt: Date | string;
  returnedAt?: Date | string;
  durationMs?: number;
}

export interface IntegrityEventDto {
  id: string;
  sessionId: string;
  clientEventId: string;
  type: string;
  detectedAt: string;
  returnedAt?: string;
  durationMs?: number;
  counted: boolean;
  reason: string;
}

/** Official response of the candidate integrity endpoint. */
/**
 * What the backend decided for a reported event. The browser never sends this;
 * it is derived from the official counters after the write.
 */
export type IntegrityAction = "warned" | "terminated" | "duplicate" | "recorded";

export interface IntegrityEventResult {
  sessionId: string;
  clientEventId: string;
  counted: boolean;
  warningCount: number;
  warningLimit: number;
  /** Official session status after the decision (REST field name). */
  sessionStatus: SessionStatus;
  action: IntegrityAction;
  reason: string;
  event: IntegrityEventDto;
}

/** Reviewer-facing timeline plus the official warning summary. */
export interface IntegritySummaryDto {
  sessionId: string;
  warningCount: number;
  warningLimit: number;
  status: SessionStatus;
  events: IntegrityEventDto[];
}

interface SessionsServiceOptions {
  generateAccessCode?: () => string;
  now?: () => Date;
  emailService?: EmailService;
  /** Real-time fan-out. Optional so the service stays unit-testable without a gateway. */
  events?: InterviewEventPublisher;
}

export const SESSION_INCLUDE = {
  candidate: { select: { name: true, email: true } },
  createdBy: { select: { id: true, name: true, role: true } },
  template: { select: { title: true, roleType: true, timeLimitMin: true } },
  report: { select: { overallScore: true } },
};

export const CANDIDATE_SESSION_INCLUDE = {
  candidate: { select: { name: true, email: true } },
  createdBy: { select: { id: true, name: true, role: true } },
  template: {
    select: {
      id: true,
      title: true,
      description: true,
      roleType: true,
      timeLimitMin: true,
      scoringRules: true,
      createdById: true,
      organizationId: true,
      modules: {
        include: { questions: { orderBy: { createdAt: "asc" } } },
        orderBy: { orderIndex: "asc" },
      },
    },
  },
};

const CANDIDATE_SELECT = { id: true, role: true, organizationId: true };
const INVITE_ONLY_PASSWORD_PREFIX = "evalora-invite-only";
const SALT_ROUNDS = 12;

/**
 * Which browser signals count toward the official warning. A real visibility
 * transition to hidden and a sustained pointer exit count; blur/pagehide/
 * beforeunload are stored as supporting evidence because they can fire for
 * benign reasons (clicking another window, a browser update) and would create
 * false positives. This rule lives here — the browser never decides what
 * counts, and the frontend only reports a pointer exit after the pointer has
 * stayed outside the window past its own threshold.
 */
const INTEGRITY_COUNTED_TYPES: ReadonlySet<string> = new Set(["visibilitychange", "pointer_exit"]);
const INTEGRITY_DUPLICATE_REASON = "Duplicate integrity event. No additional warning was counted.";
const INTEGRITY_EVENTS_LIMIT = 200;
/** Default warning limit when a session row predates the column or carries no value. */
const DEFAULT_WARNING_LIMIT = 2;

/**
 * Candidates are invite-only: they authenticate with the private access code and
 * `login` refuses the CANDIDATE role outright, so this stored hash is a
 * placeholder that can never grant access.
 *
 * It is computed once per process instead of per candidate because bcryptjs is
 * pure JavaScript and blocks the event loop — hashing on every session creation
 * serialized concurrent requests and dominated create latency under load. The
 * plaintext is a random UUID that is never stored, logged, or transmitted.
 */
let inviteOnlyPasswordHash: string | null = null;
async function getInviteOnlyPasswordHash(): Promise<string> {
  if (!inviteOnlyPasswordHash) {
    inviteOnlyPasswordHash = await bcrypt.hash(`${INVITE_ONLY_PASSWORD_PREFIX}-${randomUUID()}`, SALT_ROUNDS);
  }
  return inviteOnlyPasswordHash;
}

@Injectable()
export class SessionsService {
  private readonly generateAccessCode: () => string;
  private readonly now: () => Date;
  private readonly emailService?: EmailService;
  private readonly events?: InterviewEventPublisher;

  constructor(
    private readonly prisma: SessionPrismaClient,
    options: SessionsServiceOptions = {},
  ) {
    this.generateAccessCode = options.generateAccessCode ?? defaultAccessCode;
    this.now = options.now ?? (() => new Date());
    this.emailService = options.emailService;
    this.events = options.events;
  }

  /**
   * Announces a status transition to everyone watching the session, so an
   * interviewer sees a submission or a timeout land without polling or
   * re-joining.
   *
   * Fire-and-forget: the write is already committed, so a transport failure must
   * never turn a successful submission into an error for the candidate. Clients
   * that miss an event still recover via REST or the re-join snapshot.
   */
  private publishSessionUpdated(session: { id: string; status: PrismaSessionStatus; startedAt?: Date | null; completedAt?: Date | null }) {
    try {
      this.events?.emitToSession(session.id, INTERVIEW_EVENTS.sessionUpdated, {
        sessionId: session.id,
        // Same field names and lowercase status vocabulary as SessionSnapshot and
        // every REST DTO, so a live update, a re-join snapshot and a fetched
        // session can never disagree.
        status: fromPrismaSessionStatus(session.status),
        startedAt: toIso(session.startedAt),
        completedAt: toIso(session.completedAt),
      });
    } catch {
      // Swallowed on purpose — see above.
    }
  }

  async createSession(input: CreateSessionInput, access?: AccessContext): Promise<InterviewSessionDto> {
    const create = requireMethod(this.prisma.interviewSession.create, "interviewSession.create");
    const organizationId = resolveWritableOrganizationId(input.organizationId, access);
    const templateId = requireNonEmpty(input.templateId, "Template id is required.");
    await this.assertTemplateAssignment(templateId, organizationId, access);
    const candidateId = await this.resolveCandidateId(input, organizationId, access);
    const assignedInterviewers = await this.resolveAssignedInterviewers(input.interviewerIds, organizationId);
    const metadata = normalizeSessionMetadata(input, this.now(), assignedInterviewers);
    const session = await create({
      data: {
        candidateId,
        templateId,
        organizationId,
        createdById: access?.userId,
        accessCode: this.generateAccessCode(),
        status: "NOT_STARTED",
        expiresAt: resolveExpiry(input.expiresAt, this.now()),
        ...metadata,
      },
      include: SESSION_INCLUDE,
    });

    const dto = toSessionDto(session);
    const candidateEmail = dto.candidateEmail?.trim();
    const assessmentUrl = this.emailService?.buildAssessmentUrl(dto.accessCode);

    if (!candidateEmail || !this.emailService) {
      return {
        ...dto,
        assessmentUrl,
        emailDelivery: {
          status: "skipped",
          reason: candidateEmail
            ? "Email service unavailable. Share the assessment link manually."
            : "No candidate email on the session. Share the assessment link manually.",
        } satisfies EmailDeliveryResult,
      };
    }

    // Fire-and-forget so session creation stays fast (SMTP often takes seconds).
    const emailService = this.emailService;
    const accessCode = dto.accessCode;
    const candidateName = dto.candidateName;
    const assessmentTitle = dto.title || dto.templateTitle;
    const expiresAt = dto.expiresAt;
    const resolvedAssessmentUrl = assessmentUrl ?? emailService.buildAssessmentUrl(accessCode);

    void (async () => {
      let organizationName: string | undefined;
      if (organizationId && this.prisma.organization?.findUnique) {
        const organization = await this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { name: true },
        });
        organizationName = organization?.name;
      }
      await emailService.sendCandidateAssessmentInvite({
        to: candidateEmail,
        candidateName,
        organizationName,
        assessmentTitle,
        accessCode,
        assessmentUrl: resolvedAssessmentUrl,
        expiresAt,
      });
    })().catch(() => undefined);

    return {
      ...dto,
      assessmentUrl: resolvedAssessmentUrl,
      emailDelivery: {
        status: "queued",
        reason: "Email is being sent in the background. You can also copy the assessment link below.",
      } satisfies EmailDeliveryResult,
    };
  }

  async listSessions(filter: ListSessionsFilter = {}, access?: AccessContext): Promise<InterviewSessionDto[]> {
    const findMany = requireMethod(this.prisma.interviewSession.findMany, "interviewSession.findMany");
    const sessions = await findMany({
      relationLoadStrategy: "join",
      where: mergeWhere(buildSessionWhere(filter), buildSessionOwnershipWhere(access)),
      include: SESSION_INCLUDE,
      orderBy: { updatedAt: "desc" },
      take: DEFAULT_LIST_LIMIT,
    });

    const reconciled = await this.reconcileTimedOutSessions(sessions as SessionRow[]);
    return reconciled.map(toSessionDto);
  }

  async getSession(id: string, access?: AccessContext): Promise<InterviewSessionDto | null> {
    let session: SessionRow | null;
    if (access) {
      const findFirst = requireMethod(this.prisma.interviewSession.findFirst, "interviewSession.findFirst");
      session = (await findFirst({
        relationLoadStrategy: "join",
        where: mergeWhere({ id }, buildSessionOwnershipWhere(access)),
        include: SESSION_INCLUDE,
      })) as SessionRow | null;
    } else {
      const findUnique = requireMethod(this.prisma.interviewSession.findUnique, "interviewSession.findUnique");
      session = (await findUnique({ relationLoadStrategy: "join", where: { id }, include: SESSION_INCLUDE })) as SessionRow | null;
    }

    if (!session) return null;
    const [reconciled] = await this.reconcileTimedOutSessions([session]);
    return toSessionDto(reconciled);
  }

  /**
   * Lazily reconciles sessions whose time limit lapsed while the candidate was
   * away (tab closed, network lost) and never fired the client timeout call. On
   * any workspace read, an IN_PROGRESS session past `startedAt + timeLimitMin` is
   * persisted as EXPIRED so it surfaces as "Withdrawn / Rejected". The updateMany
   * is guarded on IN_PROGRESS so a concurrent completion is never overwritten.
   */
  private async reconcileTimedOutSessions<T extends SessionRow>(rows: T[]): Promise<T[]> {
    const nowMs = this.now().getTime();
    const timedOutSessions = rows.filter((row) => isSessionTimedOut(row, nowMs)).map((row) => ({
      id: row.id,
      expiredAt: new Date(row.startedAt!.getTime() + row.template!.timeLimitMin! * 60_000),
    }));
    if (timedOutSessions.length === 0) return rows;

    const updateMany = requireMethod(this.prisma.interviewSession.updateMany, "interviewSession.updateMany");
    const results = await Promise.all(timedOutSessions.map((session) => updateMany({
      where: { id: { in: [session.id] }, status: "IN_PROGRESS" },
      data: { status: "EXPIRED", expiredAt: session.expiredAt },
    })));

    const timedOutIds = timedOutSessions.map((session) => session.id);
    const expired = await this.resolveExpiredIds(timedOutIds, results.reduce((count, result) => count + result.count, 0));
    for (const row of rows) {
      if (expired.has(row.id)) this.publishSessionUpdated({ ...row, status: "EXPIRED" });
    }
    return rows.map((row) => (expired.has(row.id) ? { ...row, status: "EXPIRED" as PrismaSessionStatus } : row));
  }

  /**
   * Which of the candidate rows the guarded write actually moved to EXPIRED.
   * `updateMany` reports only a count, so a partial result cannot say WHICH rows
   * landed — and announcing an expiry for a session a candidate had just submitted
   * would overwrite its correct COMPLETED broadcast with a wrong one. The extra
   * read only happens on that partial case, which needs a genuine race to occur.
   */
  private async resolveExpiredIds(ids: string[], flippedCount: number): Promise<Set<string>> {
    if (flippedCount === 0) return new Set();
    if (flippedCount === ids.length) return new Set(ids);

    const findMany = this.prisma.interviewSession.findMany;
    // Without findMany there is no way to ask; fall back to the count-based view
    // rather than dropping a legitimate expiry.
    if (!findMany) return new Set(ids);
    const rows = (await findMany.call(this.prisma.interviewSession, {
      where: { id: { in: ids }, status: "EXPIRED" },
      select: { id: true },
    })) as Array<{ id: string }>;
    return new Set(rows.map((row) => row.id));
  }

  async getSessionByAccessCode(accessCode: string): Promise<CandidateAccessSessionDto> {
    const session = await this.findCandidateSessionByAccessCode(accessCode);
    assertCandidateAccessOpen(session);
    return toCandidateAccessSessionDto(session);
  }

  async startSession(id: string, access?: AccessContext): Promise<InterviewSessionDto> {
    if (access) {
      const current = await this.getSession(id, access);
      if (!current) throw forbiddenResourceError("Session");
      if (current.status === "in_progress") return current;
      if (current.status !== "not_started") throw new ConflictException("Only a not-started session can be started.");
    }

    const update = requireMethod(this.prisma.interviewSession.update, "interviewSession.update");
    const session = await update({
      where: { id },
      data: { status: "IN_PROGRESS", startedAt: this.now() },
      include: SESSION_INCLUDE,
    });

    this.publishSessionUpdated(session as SessionRow);
    return toSessionDto(session as SessionRow);
  }

  /**
   * A session cannot be submitted while a required interviewer follow-up is still
   * unanswered. Enforced server-side (not just in the UI) because a question can
   * be sent while the candidate is already on the review screen. Cancelled and
   * optional questions never block.
   */
  private async assertNoPendingRequiredFollowUps(sessionId: string): Promise<void> {
    const count = this.prisma.interviewerFollowUp?.count;
    if (!count) return;
    const pending = await count({ where: { sessionId, required: true, status: "SENT" } });
    if (pending > 0) {
      throw new ConflictException({
        statusCode: 409,
        code: "INTERVIEWER_FOLLOW_UP_REQUIRED",
        message: "Answer the required interviewer questions before submitting.",
        pending,
      });
    }
  }

  async startSessionByAccessCode(accessCode: string): Promise<CandidateAccessSessionDto> {
    const current = await this.findCandidateSessionByAccessCode(accessCode);
    assertCandidateAccessOpen(current);
    if (current.status === "IN_PROGRESS") return toCandidateAccessSessionDto(current);
    if (current.status !== "NOT_STARTED") throw forbiddenResourceError("Session cannot be started");
    const update = requireMethod(this.prisma.interviewSession.update, "interviewSession.update");
    const session = await update({
      where: { id: current.id },
      data: { status: "IN_PROGRESS", startedAt: this.now() },
      include: CANDIDATE_SESSION_INCLUDE,
    });
    this.publishSessionUpdated(session as CandidateSessionRow);
    return toCandidateAccessSessionDto(session as CandidateSessionRow);
  }

  /**
   * Deletes a session (and its cascaded responses, code submissions, evaluations,
   * report, and reviewer notes). Scoped through deleteMany + the caller's
   * ownership filter so one workspace cannot delete another's records; a miss
   * (wrong id or not owned) surfaces as a forbidden/not-found error.
   */
  async deleteSession(id: string, access?: AccessContext): Promise<void> {
    const deleteMany = requireMethod(this.prisma.interviewSession.deleteMany, "interviewSession.deleteMany");
    const result = await deleteMany({ where: mergeWhere({ id }, buildSessionOwnershipWhere(access)) });
    if (result.count === 0) throw forbiddenResourceError("Session");
  }

  async completeSession(id: string, access?: AccessContext): Promise<InterviewSessionDto> {
    if (access) {
      const current = await this.getSession(id, access);
      if (!current) throw forbiddenResourceError("Session");
      if (current.status === "completed") return current;
      if (current.status !== "in_progress") throw new ConflictException("Start the session before completing it.");
    }

    await this.assertNoPendingRequiredFollowUps(id);

    const update = requireMethod(this.prisma.interviewSession.update, "interviewSession.update");
    const session = await update({
      where: { id },
      data: { status: "COMPLETED", completedAt: this.now() },
      include: SESSION_INCLUDE,
    });

    this.publishSessionUpdated(session as SessionRow);
    return toSessionDto(session as SessionRow);
  }

  async completeSessionByAccessCode(accessCode: string): Promise<CandidateAccessSessionDto> {
    const current = await this.findCandidateSessionByAccessCode(accessCode);
    assertCandidateAccessOpen(current);
    if (current.status !== "IN_PROGRESS") throw forbiddenResourceError("Start the session before completing it");
    await this.assertNoPendingRequiredFollowUps(current.id);
    const update = requireMethod(this.prisma.interviewSession.update, "interviewSession.update");
    const session = await update({
      where: { id: current.id },
      data: { status: "COMPLETED", completedAt: this.now() },
      include: CANDIDATE_SESSION_INCLUDE,
    });
    this.publishSessionUpdated(session as CandidateSessionRow);
    return toCandidateAccessSessionDto(session as CandidateSessionRow);
  }

  /**
   * Marks a timed assessment as EXPIRED (shown to the workspace as
   * "Withdrawn / Rejected") once the candidate's time limit has elapsed. Called
   * by the candidate app when the countdown reaches zero. The elapsed time is
   * re-checked server-side so a client cannot expire a session early.
   */
  async expireSessionByAccessCode(accessCode: string): Promise<CandidateAccessSessionDto> {
    const current = await this.findCandidateSessionByAccessCode(accessCode);
    const status = fromPrismaSessionStatus(current.status);

    // Terminal states are left untouched: a submitted assessment must not be
    // downgraded to expired, and repeated timeout signals are idempotent.
    if (status === "completed" || status === "expired") {
      return toCandidateAccessSessionDto(current);
    }
    if (status !== "in_progress") {
      throw forbiddenResourceError("Only an in-progress session can time out");
    }

    const timeLimitMin = current.template?.timeLimitMin ?? null;
    if (!timeLimitMin || !current.startedAt) {
      throw forbiddenResourceError("This assessment is not timed");
    }
    const deadline = current.startedAt.getTime() + timeLimitMin * 60_000;
    const CLOCK_SKEW_GRACE_MS = 5_000;
    if (deadline - this.now().getTime() > CLOCK_SKEW_GRACE_MS) {
      throw forbiddenResourceError("The assessment time limit has not elapsed");
    }

    const update = requireMethod(this.prisma.interviewSession.update, "interviewSession.update");
    const session = await update({
      where: { id: current.id },
      data: { status: "EXPIRED", expiredAt: new Date(deadline) },
      include: CANDIDATE_SESSION_INCLUDE,
    });
    this.publishSessionUpdated(session as CandidateSessionRow);
    return toCandidateAccessSessionDto(session as CandidateSessionRow);
  }

  /**
   * Records a browser-detected integrity signal for an active session.
   *
   * The backend is the only source of truth here:
   * - only an in-progress, unexpired session accepts events;
   * - `sessionId + clientEventId` is deduplicated so a retry never double-counts;
   * - `counted` is derived from the event TYPE (only a real visibility change to
   *   hidden counts), never accepted from the browser;
   * - the event row and the warning increment are written in one transaction;
   * - the first counted event (warningCount = 1) only warns and keeps the
   *   session active; once `warningCount >= warningLimit` (the second strike),
   *   the server expires the session. Either way `integrity.updated` is
   *   broadcast to the authorized session room.
   */
  async recordIntegrityEvent(accessCode: string, input: IntegrityEventInput): Promise<IntegrityEventResult> {
    const session = await this.findCandidateSessionByAccessCode(accessCode);
    assertCandidateAccessOpen(session);
    if (session.status !== "IN_PROGRESS") {
      throw forbiddenResourceError("Only an in-progress session accepts integrity events");
    }

    const clientEventId = normalizeClientEventId(input.clientEventId);
    const type = input.type;
    const detectedAt = strictToDate(input.detectedAt, "detectedAt");
    const returnedAt = input.returnedAt != null ? strictToDate(input.returnedAt, "returnedAt") : undefined;
    if (returnedAt && returnedAt.getTime() < detectedAt.getTime()) {
      throw new BadRequestException("returnedAt cannot be earlier than detectedAt.");
    }
    const durationMs = input.durationMs != null ? Math.round(input.durationMs) : undefined;
    const counted = INTEGRITY_COUNTED_TYPES.has(type);
    const reason = integrityReason(type, counted);

    // ------------------------------------------------------------
    // Deduplicate before writing: retrying the same clientEventId must
    // return the stored event without counting it a second time.
    // ------------------------------------------------------------
    const findUnique = this.prisma.integrityEvent?.findUnique;
    const existing = findUnique
      ? await findUnique({ where: { sessionId_clientEventId: { sessionId: session.id, clientEventId } } })
      : null;
    if (existing) {
      return this.integrityResult(session, existing, false, INTEGRITY_DUPLICATE_REASON);
    }

    // ------------------------------------------------------------
    // Write the event and the warning increment atomically.
    // ------------------------------------------------------------
    let created: IntegrityEventRow;
    try {
      created = await this.persistIntegrityEvent(session.id, {
        clientEventId,
        type,
        detectedAt,
        returnedAt,
        durationMs,
        counted,
        reason,
      });
    } catch (error) {
      // A concurrent retry can beat us to the insert and raise the unique
      // constraint before our pre-check sees it. Treat that like a duplicate.
      if (isUniqueConstraintError(error) && findUnique) {
        const raced = await findUnique({ where: { sessionId_clientEventId: { sessionId: session.id, clientEventId } } });
        if (raced) return this.integrityResult(session, raced, false, INTEGRITY_DUPLICATE_REASON);
      }
      throw error;
    }

    // The increment ran inside the transaction, so re-read the authoritative
    // counters before deciding enforcement — a concurrent event may have landed
    // between our dedupe read and this write.
    const fresh = await this.readIntegrityState(session.id);
    const warningCount = fresh?.warningCount ?? (session.warningCount ?? 0) + (counted ? 1 : 0);
    const warningLimit = fresh?.warningLimit ?? session.warningLimit ?? DEFAULT_WARNING_LIMIT;

    // ------------------------------------------------------------
    // Two-strike enforcement, decided server-side only:
    // - warningCount = 1 keeps the session ACTIVE and returns a warning;
    // - warningCount >= warningLimit (the second strike) expires the session.
    // ------------------------------------------------------------
    let finalStatus: PrismaSessionStatus = fresh?.status ?? session.status;
    let action: IntegrityAction = counted ? "warned" : "recorded";
    if (counted && warningCount >= warningLimit && finalStatus === "IN_PROGRESS") {
      const update = requireMethod(this.prisma.interviewSession.update, "interviewSession.update");
      const expired = await update({
        where: { id: session.id },
        data: { status: "EXPIRED" },
        include: CANDIDATE_SESSION_INCLUDE,
      });
      finalStatus = expired.status;
      action = "terminated";
      this.publishSessionUpdated(expired as CandidateSessionRow);
    }

    const sessionStatus = fromPrismaSessionStatus(finalStatus);
    const event = toIntegrityEventDto(created);
    this.publishIntegrityUpdated(session.id, { warningCount, warningLimit, status: sessionStatus, action, reason, event });

    return {
      sessionId: session.id,
      clientEventId,
      counted,
      warningCount,
      warningLimit,
      sessionStatus,
      action,
      reason,
      event,
    };
  }

  /**
   * Reviewer-facing integrity timeline for one session. Scoped through the
   * caller's ownership filter so one workspace can never read another's events.
   */
  async getIntegrityEvents(sessionId: string, access?: AccessContext): Promise<IntegritySummaryDto> {
    const findFirst = requireMethod(this.prisma.interviewSession.findFirst, "interviewSession.findFirst");
    const session = await findFirst({
      relationLoadStrategy: "join",
      where: mergeWhere({ id: sessionId }, buildSessionOwnershipWhere(access)),
      select: { id: true, status: true, warningCount: true, warningLimit: true },
    });
    if (!session) throw forbiddenResourceError("Session");

    const events = this.prisma.integrityEvent?.findMany
      ? await this.prisma.integrityEvent.findMany({
          where: { sessionId: session.id },
          orderBy: { detectedAt: "asc" },
          take: INTEGRITY_EVENTS_LIMIT,
        })
      : [];

    return {
      sessionId: session.id,
      warningCount: session.warningCount ?? 0,
      warningLimit: session.warningLimit ?? DEFAULT_WARNING_LIMIT,
      status: fromPrismaSessionStatus(session.status),
      events: events.map(toIntegrityEventDto),
    };
  }

  /**
   * Writes the event and (for counted events) increments warningCount in one
   * transaction. Falls back to sequential writes only when a mock client has no
   * transaction support; the real Prisma client always runs the atomic path.
   */
  private async persistIntegrityEvent(
    sessionId: string,
    data: {
      clientEventId: string;
      type: IntegrityEventType;
      detectedAt: Date;
      returnedAt?: Date;
      durationMs?: number;
      counted: boolean;
      reason: string;
    },
  ): Promise<IntegrityEventRow> {
    const row = { ...data, sessionId };

    if (this.prisma.$transaction) {
      const [created] = await this.prisma.$transaction(async (tx) => {
        const event = await tx.integrityEvent.create({ data: row });
        if (data.counted) {
          await tx.interviewSession.update({
            where: { id: sessionId },
            data: { warningCount: { increment: 1 } },
          });
        }
        return [event];
      });
      return created;
    }

    const event = await requireMethod(this.prisma.integrityEvent?.create, "integrityEvent.create")({ data: row });
    if (data.counted) {
      await requireMethod(this.prisma.interviewSession.update, "interviewSession.update")({
        where: { id: sessionId },
        data: { warningCount: { increment: 1 } },
      });
    }
    return event;
  }

  private async readIntegrityState(
    sessionId: string,
  ): Promise<{ warningCount: number; warningLimit: number; status: PrismaSessionStatus } | null> {
    const findUnique = this.prisma.interviewSession.findUnique;
    if (!findUnique) return null;
    const row = await findUnique({
      where: { id: sessionId },
      select: { warningCount: true, warningLimit: true, status: true },
    });
    return row
      ? { warningCount: row.warningCount ?? 0, warningLimit: row.warningLimit ?? DEFAULT_WARNING_LIMIT, status: row.status }
      : null;
  }

  private integrityResult(
    session: CandidateSessionRow,
    event: IntegrityEventRow,
    counted: boolean,
    reason: string,
  ): IntegrityEventResult {
    return {
      sessionId: session.id,
      clientEventId: event.clientEventId,
      counted,
      warningCount: session.warningCount ?? 0,
      warningLimit: session.warningLimit ?? DEFAULT_WARNING_LIMIT,
      sessionStatus: fromPrismaSessionStatus(session.status),
      action: "duplicate",
      reason,
      event: toIntegrityEventDto(event),
    };
  }

  /**
   * Announces an integrity decision to everyone watching the session. Only
   * sockets that joined the authorized session room receive it, because the
   * gateway enforces authorization before a socket can enter that room.
   * Fire-and-forget like every other live update: the write is committed.
   */
  private publishIntegrityUpdated(
    sessionId: string,
    payload: { warningCount: number; warningLimit: number; status: SessionStatus; action: IntegrityAction; reason: string; event: IntegrityEventDto },
  ) {
    try {
      this.events?.emitToSession(sessionId, INTERVIEW_EVENTS.integrityUpdated, {
        sessionId,
        warningCount: payload.warningCount,
        warningLimit: payload.warningLimit,
        status: payload.status,
        action: payload.action,
        reason: payload.reason,
        event: payload.event,
      });
    } catch {
      // Swallowed on purpose — clients recover via REST or the re-join snapshot.
    }
  }

  private async resolveCandidateId(input: CreateSessionInput, organizationId: string | undefined, access?: AccessContext): Promise<string> {
    if (input.candidateId?.trim()) {
      const candidateId = input.candidateId.trim();
      if (!access) return candidateId;
      const findUnique = requireMethod(this.prisma.user?.findUnique, "user.findUnique");
      const candidate = await findUnique({ where: { id: candidateId }, select: CANDIDATE_SELECT });
      assertCandidateBelongsToOrganization(candidate, organizationId);
      return candidateId;
    }

    const email = normalizeEmail(requireNonEmpty(input.candidateEmail, "Candidate email is required."));
    const name = input.candidateName?.trim() || candidateNameFromEmail(email);
    const findUnique = requireMethod(this.prisma.user?.findUnique, "user.findUnique");
    const create = requireMethod(this.prisma.user?.create, "user.create");

    const existingCandidate = await findUnique({
      where: { email },
      select: CANDIDATE_SELECT,
    });
    if (existingCandidate) {
      if (existingCandidate.role !== "CANDIDATE") {
        throw new Error("Candidate email is already used by a platform account.");
      }
      // Candidate identity is global (one account per email); session access is scoped by
      // InterviewSession.organizationId, not by the candidate row's original organizationId.
      // So the same person can be invited by any workspace without a collision.
      return existingCandidate.id;
    }

    const passwordHash = await getInviteOnlyPasswordHash();
    const candidate = await create({
      data: {
        name,
        email,
        emailVerified: true,
        passwordHash,
        role: "CANDIDATE",
        organizationId,
      },
      select: CANDIDATE_SELECT,
    });
    return candidate.id;
  }

  private async findCandidateSessionByAccessCode(accessCode: string): Promise<CandidateSessionRow> {
    const findFirst = requireMethod(this.prisma.interviewSession.findFirst, "interviewSession.findFirst");
    const normalized = normalizeAccessCode(accessCode);
    const session = await findFirst({
      relationLoadStrategy: "join",
      where: { accessCode: normalized },
      include: CANDIDATE_SESSION_INCLUDE,
    });
    if (!session) throw forbiddenResourceError("Session");
    return session as CandidateSessionRow;
  }

  private async assertTemplateAssignment(templateId: string, organizationId: string | undefined, access?: AccessContext): Promise<void> {
    if (!access) return;
    const findFirst = requireMethod(this.prisma.assessmentTemplate?.findFirst, "assessmentTemplate.findFirst");
    const requestedOrganization = access.role === "admin" && organizationId ? { organizationId } : undefined;
    const template = await findFirst({
      where: mergeWhere({ id: templateId }, requestedOrganization, buildTemplateOwnershipWhere(access)),
      select: { id: true, organizationId: true },
    });
    if (!template) throw forbiddenResourceError("Template");
  }

  private async resolveAssignedInterviewers(
    value: CreateSessionInput["interviewerIds"],
    organizationId: string | undefined,
  ): Promise<StoredInterviewerAssignment[] | undefined> {
    const ids = normalizeInterviewerIds(value);
    if (!ids.length) return undefined;
    if (!organizationId) throw new BadRequestException("An organization is required to assign interviewers.");

    const findMany = requireMethod(this.prisma.user?.findMany, "user.findMany");
    const members = await findMany({
      where: {
        id: { in: ids },
        organizationId,
        role: { in: ["ORGANIZATION", "INTERVIEWER"] },
      },
      select: { id: true, name: true },
    });
    const byId = new Map(members.map((member) => [member.id, member]));
    if (ids.some((id) => !byId.has(id))) {
      throw new BadRequestException("One or more selected interviewers are not members of this workspace.");
    }
    return ids.map((id) => {
      const member = byId.get(id)!;
      return { id: member.id, name: member.name ?? "Workspace member" };
    });
  }
}

function buildSessionWhere(filter: ListSessionsFilter) {
  const where: Record<string, unknown> = {};
  if (filter.organizationId) where.organizationId = filter.organizationId;
  if (filter.candidateId) where.candidateId = filter.candidateId;
  if (filter.templateId) where.templateId = filter.templateId;
  if (filter.status) where.status = toPrismaSessionStatus(filter.status);
  return Object.keys(where).length ? where : undefined;
}

function resolveWritableOrganizationId(requestedOrganizationId: string | undefined, access?: AccessContext): string | undefined {
  if (!access || access.role === "admin") return requestedOrganizationId;
  return requireOrganizationId(access);
}

function toSessionDto(session: SessionRow): InterviewSessionDto {
  const interviewers = storedInterviewerNames(session.interviewers);
  const interviewerName = interviewers[0] ?? session.createdBy?.name;
  const interviewerRole = interviewers[0]
    ? "Interviewer"
    : session.createdBy?.role
      ? fromPrismaRole(session.createdBy.role)
      : undefined;

  return {
    id: session.id,
    candidateId: session.candidateId,
    candidateName: session.candidate?.name ?? "Unknown Candidate",
    candidateEmail: session.candidate?.email,
    templateId: session.templateId,
    templateTitle: session.template?.title,
    targetRole: session.targetRole?.trim() || session.template?.roleType,
    title: session.title ?? undefined,
    interviewType: session.interviewType ?? undefined,
    interviewers: interviewers.length ? interviewers : undefined,
    interviewerName,
    interviewerRole,
    notes: session.notes ?? undefined,
    department: session.department ?? undefined,
    scheduledAt: toIso(session.scheduledAt),
    durationMin: session.durationMin ?? undefined,
    language: session.language ?? undefined,
    timeZone: session.timeZone ?? undefined,
    createdById: session.createdById ?? session.createdBy?.id ?? undefined,
    organizationId: session.organizationId ?? undefined,
    status: fromPrismaSessionStatus(session.status),
    accessCode: session.accessCode,
    warningCount: session.warningCount ?? 0,
    warningLimit: session.warningLimit ?? DEFAULT_WARNING_LIMIT,
    overallScore: session.report?.overallScore,
    reportReady: Boolean(session.report),
    startedAt: toIso(session.startedAt),
    completedAt: toIso(session.completedAt),
    expiresAt: toIso(session.expiresAt),
    createdAt: toIso(session.createdAt),
    updatedAt: toIso(session.updatedAt),
  };
}

function normalizeSessionMetadata(
  input: CreateSessionInput,
  now: Date,
  assignedInterviewers?: StoredInterviewerAssignment[],
): {
  title?: string;
  interviewType?: string;
  interviewers?: JsonValue;
  notes?: string;
  targetRole?: string;
  department?: string;
  scheduledAt?: Date;
  durationMin?: number;
  language?: string;
  timeZone?: string;
} {
  const interviewers = assignedInterviewers?.length ? assignedInterviewers : normalizeInterviewers(input.interviewers);
  const durationMin = normalizeDurationMin(input.durationMin);
  const scheduledAt = resolveScheduledAt(input.scheduledAt, input.sessionDate, input.startTime, now);

  return {
    title: optionalTrimmed(input.title),
    interviewType: optionalTrimmed(input.interviewType),
    interviewers: interviewers.length ? interviewers : undefined,
    notes: optionalTrimmed(input.notes),
    targetRole: optionalTrimmed(input.targetRole),
    department: optionalTrimmed(input.department),
    scheduledAt,
    durationMin,
    language: optionalTrimmed(input.language),
    timeZone: optionalTrimmed(input.timeZone),
  };
}

function normalizeInterviewers(value: CreateSessionInput["interviewers"]): string[] {
  if (value == null) return [];
  const values = Array.isArray(value)
    ? value
    : String(value)
        .split(",")
        .map((item) => item.trim());
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of values) {
    const name = String(item ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
    if (result.length >= 20) break;
  }
  return result;
}

function normalizeInterviewerIds(value: CreateSessionInput["interviewerIds"]): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const id = String(item ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= 20) break;
  }
  return ids;
}

function normalizeDurationMin(value: number | string | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("Duration must be a positive number of minutes.");
  return Math.min(Math.round(parsed), 24 * 60);
}

function resolveScheduledAt(
  scheduledAt: Date | string | undefined,
  sessionDate: string | undefined,
  startTime: string | undefined,
  now: Date,
): Date | undefined {
  if (scheduledAt != null && String(scheduledAt).trim() !== "") {
    const direct = toDate(scheduledAt);
    if (!direct || Number.isNaN(direct.getTime())) throw new Error("Scheduled time is invalid.");
    return direct;
  }

  const datePart = optionalTrimmed(sessionDate);
  if (!datePart) return undefined;

  const timePart = optionalTrimmed(startTime) ?? "09:00";
  // Interpret sessionDate + startTime as UTC wall-clock when no full ISO scheduledAt is sent.
  const combined = new Date(`${datePart}T${normalizeClockTime(timePart)}.000Z`);
  if (Number.isNaN(combined.getTime())) throw new Error("Session date/time is invalid.");
  // Allow past scheduled labels for historical imports; only reject absurd far-future values.
  if (combined.getTime() > now.getTime() + 5 * 365 * 24 * 60 * 60 * 1_000) {
    throw new Error("Scheduled time is too far in the future.");
  }
  return combined;
}

function normalizeClockTime(value: string): string {
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  throw new Error("Start time must use HH:mm format.");
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function fromPrismaRole(role: PrismaRole): string {
  if (role === "ORGANIZATION") return "Organization";
  if (role === "ADMIN") return "Admin";
  if (role === "INTERVIEWER") return "Interviewer";
  return "Candidate";
}

function toCandidateAccessSessionDto(session: CandidateSessionRow): CandidateAccessSessionDto {
  const sessionDto = toSessionDto({ ...session, template: session.template ? { title: session.template.title } : null });
  return {
    ...sessionDto,
    template: toCandidateTemplateDto(session.template),
  };
}

function toCandidateTemplateDto(template: CandidateTemplateRow | null | undefined): AssessmentTemplateDto {
  if (!template) {
    return {
      id: "",
      title: "Unknown Assessment",
      description: "",
      roleType: "",
      modules: [],
    };
  }

  return {
    id: template.id,
    title: template.title,
    description: template.description ?? "",
    roleType: template.roleType,
    timeLimitMin: template.timeLimitMin ?? undefined,
    scoringRules: undefined,
    createdById: undefined,
    organizationId: undefined,
    modules: (template.modules ?? []).map((module) => ({
      id: module.id,
      type: fromPrismaModuleType(module.moduleType),
      title: module.title,
      description: module.description ?? "",
      weight: module.weight,
      orderIndex: module.orderIndex,
      settings: module.settings ?? undefined,
      // The final AI interview is generated from the candidate's completed
      // assessment context. Legacy authored seed questions must never leak into
      // the candidate flow or become a second, competing opening question.
      questions: (module.moduleType === "AI_INTERVIEW" ? [] : (module.questions ?? [])).map((question) => ({
        id: question.id,
        questionText: question.questionText,
        questionType: fromPrismaQuestionType(question.questionType),
        options: question.options ?? undefined,
        rubric: undefined,
      })),
    })),
  };
}

// Server-side auto-expiry (triggered by interviewer reads) waits this long past
// the deadline before flipping a session to EXPIRED. It matches the candidate
// timeout path's clock-skew tolerance (CLOCK_SKEW_GRACE_MS in
// expireSessionByAccessCode) so an interviewer opening the dashboard exactly at
// the deadline can't expire the session out from under a candidate who is still
// submitting their final answer.
const AUTO_EXPIRY_GRACE_MS = 5_000;

function isSessionTimedOut(session: SessionRow, nowMs: number): boolean {
  if (session.status !== "IN_PROGRESS" || !session.startedAt) return false;
  const timeLimitMin = session.template?.timeLimitMin ?? null;
  if (!timeLimitMin || timeLimitMin <= 0) return false;
  return session.startedAt.getTime() + timeLimitMin * 60_000 + AUTO_EXPIRY_GRACE_MS <= nowMs;
}

function assertCandidateAccessOpen(session: CandidateSessionRow): void {
  const status = fromPrismaSessionStatus(session.status);
  if (status === "completed" || status === "expired") {
    throw new GoneException("This assessment is no longer available.");
  }
  if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
    throw new GoneException("This assessment invitation has expired.");
  }
}

const VALID_SESSION_STATUSES: readonly SessionStatus[] = ["not_started", "in_progress", "completed", "expired"];

function toPrismaSessionStatus(status: SessionStatus): PrismaSessionStatus {
  // The filter arrives from an unvalidated query string; reject unknown values
  // with a 400 instead of passing garbage to Prisma (which throws a 500 on the
  // enum column).
  const normalized = String(status).toLowerCase();
  if (!VALID_SESSION_STATUSES.includes(normalized as SessionStatus)) {
    throw new BadRequestException(
      `Invalid session status "${status}". Expected one of: ${VALID_SESSION_STATUSES.join(", ")}.`,
    );
  }
  return normalized.toUpperCase() as PrismaSessionStatus;
}

function fromPrismaSessionStatus(status: PrismaSessionStatus): SessionStatus {
  return status.toLowerCase() as SessionStatus;
}

function toIso(value?: Date | null): string | undefined {
  return value ? value.toISOString() : undefined;
}

function toDate(value?: Date | string): Date | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value : new Date(value);
}

function strictToDate(value: Date | string, label: string): Date {
  const date = toDate(value);
  if (!date || Number.isNaN(date.getTime())) throw new BadRequestException(`${label} is invalid.`);
  return date;
}

function normalizeClientEventId(value: string): string {
  const trimmed = requireNonEmpty(value, "clientEventId is required.").trim();
  return trimmed.slice(0, ReportIntegrityEventDto.maxClientEventIdLength);
}

/**
 * Server-authored copy of what was detected. Never echoes candidate text, and
 * never claims proof of cheating — only what the browser signaled.
 */
function integrityReason(type: string, counted: boolean): string {
  if (counted) {
    if (type === "visibilitychange") return "Possible tab switching detected.";
    if (type === "pointer_exit") return "Pointer left the assessment window.";
    return "Possible exit from the assessment detected.";
  }
  if (type === "blur") return "Supporting signal: the browser window lost focus.";
  if (type === "pagehide" || type === "beforeunload") return "Supporting signal: the browser page started leaving.";
  return "Supporting signal recorded.";
}

function toIntegrityEventDto(event: IntegrityEventRow): IntegrityEventDto {
  return {
    id: event.id,
    sessionId: event.sessionId,
    clientEventId: event.clientEventId,
    type: event.type,
    detectedAt: toIso(event.detectedAt) ?? new Date(event.detectedAt).toISOString(),
    returnedAt: toIso(event.returnedAt),
    durationMs: event.durationMs ?? undefined,
    counted: event.counted,
    reason: event.reason,
  };
}

/** Prisma unique-constraint violation ("P2002"). */
function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** "sok.dara+jobs@example.com" → "Sok Dara"; falls back to the email itself for unusual local parts. */
function candidateNameFromEmail(email: string): string {
  const localPart = email.split("@")[0]?.replace(/\+.*$/, "") ?? "";
  const words = localPart.split(/[._-]+/).filter((word) => /[a-z]/i.test(word));
  if (!words.length) return email;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function normalizeAccessCode(accessCode: string): string {
  return requireNonEmpty(accessCode, "Access code is required.").toUpperCase();
}

function fromPrismaModuleType(type: PrismaModuleType): ModuleType {
  return type.toLowerCase() as ModuleType;
}

function fromPrismaQuestionType(type: PrismaQuestionType): QuestionType {
  return type.toLowerCase() as QuestionType;
}

function requireNonEmpty(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function requireMethod<T extends (...args: any[]) => any>(method: T | undefined, name: string): T {
  if (!method) throw new Error(`${name} is not available.`);
  return method;
}

function defaultAccessCode(): string {
  return `EV-${randomBytes(16).toString("base64url").toUpperCase()}`;
}

function resolveExpiry(value: Date | string | undefined, now: Date): Date {
  const expiresAt = toDate(value) ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
  if (Number.isNaN(expiresAt.getTime())) throw new Error("Expiry date is invalid.");
  if (expiresAt.getTime() <= now.getTime()) throw new Error("Expiry date must be in the future.");
  return expiresAt;
}

function assertCandidateBelongsToOrganization(candidate: CandidateUserRow | null, organizationId: string | undefined): void {
  if (!candidate || candidate.role !== "CANDIDATE") throw forbiddenResourceError("Candidate");
  if (organizationId && candidate.organizationId !== organizationId) throw forbiddenResourceError("Candidate");
}
