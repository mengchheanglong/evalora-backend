import { GoneException, Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import type { AssessmentTemplateDto, InterviewSessionDto, JsonValue, ModuleType, QuestionType, SessionStatus } from "../../domain/evalora.types";
import { buildSessionOwnershipWhere, buildTemplateOwnershipWhere, forbiddenResourceError, mergeWhere, requireOrganizationId, type AccessContext } from "../auth/access-control";
import type { EmailDeliveryResult, EmailService } from "../email/email.service";
import { selectCandidateQuestions } from "./candidate-assignment";

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

interface SessionRow {
  id: string;
  candidateId: string;
  candidate?: SessionUserRow | null;
  templateId: string;
  template?: SessionTemplateRow | null;
  report?: SessionReportRow | null;
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
  organizationId?: string | null;
}

type SessionCreateFn = (args: any) => Promise<SessionRow>;
type SessionFindManyFn = (args: any) => Promise<SessionRow[]>;
type SessionFindUniqueFn = (args: any) => Promise<SessionRow | null>;
type SessionFindFirstFn = (args: any) => Promise<SessionRow | CandidateSessionRow | null>;
type SessionUpdateFn = (args: any) => Promise<SessionRow | CandidateSessionRow>;
type UserFindUniqueFn = (args: any) => Promise<CandidateUserRow | null>;
type UserCreateFn = (args: any) => Promise<CandidateUserRow>;

interface SessionPrismaClient {
  user?: {
    findUnique?: UserFindUniqueFn;
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

interface SessionsServiceOptions {
  generateAccessCode?: () => string;
  now?: () => Date;
  emailService?: EmailService;
}

export const SESSION_INCLUDE = {
  candidate: { select: { name: true, email: true } },
  createdBy: { select: { id: true, name: true, role: true } },
  template: { select: { title: true, roleType: true } },
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
        include: { questions: true },
        orderBy: { orderIndex: "asc" },
      },
    },
  },
};

const CANDIDATE_SELECT = { id: true, role: true, organizationId: true };
const INVITE_ONLY_PASSWORD_PREFIX = "evalora-invite-only";
const SALT_ROUNDS = 12;

@Injectable()
export class SessionsService {
  private readonly generateAccessCode: () => string;
  private readonly now: () => Date;
  private readonly emailService?: EmailService;

  constructor(
    private readonly prisma: SessionPrismaClient,
    options: SessionsServiceOptions = {},
  ) {
    this.generateAccessCode = options.generateAccessCode ?? defaultAccessCode;
    this.now = options.now ?? (() => new Date());
    this.emailService = options.emailService;
  }

  async createSession(input: CreateSessionInput, access?: AccessContext): Promise<InterviewSessionDto> {
    const create = requireMethod(this.prisma.interviewSession.create, "interviewSession.create");
    const organizationId = resolveWritableOrganizationId(input.organizationId, access);
    const templateId = requireNonEmpty(input.templateId, "Template id is required.");
    await this.assertTemplateAssignment(templateId, organizationId, access);
    const candidateId = await this.resolveCandidateId(input, organizationId, access);
    const metadata = normalizeSessionMetadata(input, this.now());
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
      where: mergeWhere(buildSessionWhere(filter), buildSessionOwnershipWhere(access)),
      include: SESSION_INCLUDE,
      orderBy: { updatedAt: "desc" },
    });

    return sessions.map(toSessionDto);
  }

  async getSession(id: string, access?: AccessContext): Promise<InterviewSessionDto | null> {
    if (access) {
      const findFirst = requireMethod(this.prisma.interviewSession.findFirst, "interviewSession.findFirst");
      const session = await findFirst({
        where: mergeWhere({ id }, buildSessionOwnershipWhere(access)),
        include: SESSION_INCLUDE,
      });
      return session ? toSessionDto(session as SessionRow) : null;
    }

    const findUnique = requireMethod(this.prisma.interviewSession.findUnique, "interviewSession.findUnique");
    const session = await findUnique({
      where: { id },
      include: SESSION_INCLUDE,
    });

    return session ? toSessionDto(session) : null;
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
      if (current.status !== "not_started") throw new Error("Only a not-started session can be started.");
    }

    const update = requireMethod(this.prisma.interviewSession.update, "interviewSession.update");
    const session = await update({
      where: { id },
      data: { status: "IN_PROGRESS", startedAt: this.now() },
      include: SESSION_INCLUDE,
    });

    return toSessionDto(session as SessionRow);
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
    return toCandidateAccessSessionDto(session as CandidateSessionRow);
  }

  async completeSession(id: string, access?: AccessContext): Promise<InterviewSessionDto> {
    if (access) {
      const current = await this.getSession(id, access);
      if (!current) throw forbiddenResourceError("Session");
      if (current.status === "completed") return current;
      if (current.status !== "in_progress") throw new Error("Start the session before completing it.");
    }

    const update = requireMethod(this.prisma.interviewSession.update, "interviewSession.update");
    const session = await update({
      where: { id },
      data: { status: "COMPLETED", completedAt: this.now() },
      include: SESSION_INCLUDE,
    });

    return toSessionDto(session as SessionRow);
  }

  async completeSessionByAccessCode(accessCode: string): Promise<CandidateAccessSessionDto> {
    const current = await this.findCandidateSessionByAccessCode(accessCode);
    assertCandidateAccessOpen(current);
    if (current.status !== "IN_PROGRESS") throw forbiddenResourceError("Start the session before completing it");
    const update = requireMethod(this.prisma.interviewSession.update, "interviewSession.update");
    const session = await update({
      where: { id: current.id },
      data: { status: "COMPLETED", completedAt: this.now() },
      include: CANDIDATE_SESSION_INCLUDE,
    });
    return toCandidateAccessSessionDto(session as CandidateSessionRow);
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

    const name = requireNonEmpty(input.candidateName, "Candidate name is required.");
    const email = normalizeEmail(requireNonEmpty(input.candidateEmail, "Candidate email is required."));
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
      assertCandidateBelongsToOrganization(existingCandidate, organizationId);
      return existingCandidate.id;
    }

    const passwordHash = await bcrypt.hash(`${INVITE_ONLY_PASSWORD_PREFIX}-${randomUUID()}`, SALT_ROUNDS);
    const candidate = await create({
      data: {
        name,
        email,
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
    const session = await findFirst({
      where: { accessCode: normalizeAccessCode(accessCode) },
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
  const interviewers = parseInterviewers(session.interviewers);
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
): {
  title?: string;
  interviewType?: string;
  interviewers?: string[];
  notes?: string;
  targetRole?: string;
  department?: string;
  scheduledAt?: Date;
  durationMin?: number;
  language?: string;
  timeZone?: string;
} {
  const interviewers = normalizeInterviewers(input.interviewers);
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

function parseInterviewers(value: JsonValue | null | undefined): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return normalizeInterviewers(value);
  }
  return [];
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
    template: toCandidateTemplateDto(session.template, session.accessCode),
  };
}

function toCandidateTemplateDto(template: CandidateTemplateRow | null | undefined, accessCode: string): AssessmentTemplateDto {
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
      questions: selectCandidateQuestions(module.questions ?? [], accessCode, module.id, module.moduleType === "CODING" ? 0 : 2).map((question) => ({
        id: question.id,
        questionText: question.questionText,
        questionType: fromPrismaQuestionType(question.questionType),
        options: question.options ?? undefined,
        rubric: undefined,
      })),
    })),
  };
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

function toPrismaSessionStatus(status: SessionStatus): PrismaSessionStatus {
  return status.toUpperCase() as PrismaSessionStatus;
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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
