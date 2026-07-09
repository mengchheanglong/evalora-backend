import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { randomInt, randomUUID } from "node:crypto";
import type { AssessmentTemplateDto, InterviewSessionDto, JsonValue, ModuleType, QuestionType, SessionStatus } from "../../domain/evalora.types";
import { buildSessionOwnershipWhere, forbiddenResourceError, mergeWhere, requireOrganizationId, type AccessContext } from "../auth/access-control";

type PrismaSessionStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED";
type PrismaRole = "ADMIN" | "ORGANIZATION" | "INTERVIEWER" | "CANDIDATE";
type PrismaModuleType = "AI_INTERVIEW" | "CODING" | "DEBUGGING" | "WORK_STYLE" | "BEHAVIORAL" | "LEADERSHIP" | "COMMUNICATION" | "PROBLEM_SOLVING";
type PrismaQuestionType = "MCQ" | "SCALE" | "SHORT_ANSWER" | "CODING" | "SCENARIO" | "ROLEPLAY";

interface SessionUserRow {
  name: string;
  email?: string;
}

interface SessionTemplateRow {
  title: string;
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
}

export const SESSION_INCLUDE = {
  candidate: { select: { name: true, email: true } },
  template: { select: { title: true } },
};

export const CANDIDATE_SESSION_INCLUDE = {
  candidate: { select: { name: true, email: true } },
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

const CANDIDATE_SELECT = { id: true, role: true };
const INVITE_ONLY_PASSWORD_PREFIX = "evalora-invite-only";
const SALT_ROUNDS = 12;

@Injectable()
export class SessionsService {
  private readonly generateAccessCode: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly prisma: SessionPrismaClient,
    options: SessionsServiceOptions = {},
  ) {
    this.generateAccessCode = options.generateAccessCode ?? defaultAccessCode;
    this.now = options.now ?? (() => new Date());
  }

  async createSession(input: CreateSessionInput, access?: AccessContext): Promise<InterviewSessionDto> {
    const create = requireMethod(this.prisma.interviewSession.create, "interviewSession.create");
    const organizationId = resolveWritableOrganizationId(input.organizationId, access);
    const candidateId = await this.resolveCandidateId(input, organizationId);
    const session = await create({
      data: {
        candidateId,
        templateId: requireNonEmpty(input.templateId, "Template id is required."),
        organizationId,
        accessCode: this.generateAccessCode(),
        status: "NOT_STARTED",
        expiresAt: toDate(input.expiresAt),
      },
      include: SESSION_INCLUDE,
    });

    return toSessionDto(session);
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
    await this.assertSessionAccess(id, access);

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
    const update = requireMethod(this.prisma.interviewSession.update, "interviewSession.update");
    const session = await update({
      where: { id: current.id },
      data: { status: "IN_PROGRESS", startedAt: this.now() },
      include: CANDIDATE_SESSION_INCLUDE,
    });
    return toCandidateAccessSessionDto(session as CandidateSessionRow);
  }

  async completeSession(id: string, access?: AccessContext): Promise<InterviewSessionDto> {
    await this.assertSessionAccess(id, access);

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
    const update = requireMethod(this.prisma.interviewSession.update, "interviewSession.update");
    const session = await update({
      where: { id: current.id },
      data: { status: "COMPLETED", completedAt: this.now() },
      include: CANDIDATE_SESSION_INCLUDE,
    });
    return toCandidateAccessSessionDto(session as CandidateSessionRow);
  }

  private async resolveCandidateId(input: CreateSessionInput, organizationId: string | undefined): Promise<string> {
    if (input.candidateId?.trim()) return input.candidateId.trim();

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

  private async assertSessionAccess(id: string, access?: AccessContext): Promise<void> {
    if (!access || access.role === "admin") return;
    const findFirst = requireMethod(this.prisma.interviewSession.findFirst, "interviewSession.findFirst");
    const session = await findFirst({ where: mergeWhere({ id }, buildSessionOwnershipWhere(access)) });
    if (!session) throw forbiddenResourceError("Session");
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
  return {
    id: session.id,
    candidateId: session.candidateId,
    candidateName: session.candidate?.name ?? "Unknown Candidate",
    candidateEmail: session.candidate?.email,
    templateId: session.templateId,
    templateTitle: session.template?.title,
    organizationId: session.organizationId ?? undefined,
    status: fromPrismaSessionStatus(session.status),
    accessCode: session.accessCode,
    startedAt: toIso(session.startedAt),
    completedAt: toIso(session.completedAt),
    expiresAt: toIso(session.expiresAt),
    createdAt: toIso(session.createdAt),
    updatedAt: toIso(session.updatedAt),
  };
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
    scoringRules: template.scoringRules ?? undefined,
    createdById: template.createdById,
    organizationId: template.organizationId ?? undefined,
    modules: (template.modules ?? []).map((module) => ({
      id: module.id,
      type: fromPrismaModuleType(module.moduleType),
      title: module.title,
      description: module.description ?? "",
      weight: module.weight,
      orderIndex: module.orderIndex,
      settings: module.settings ?? undefined,
      questions: (module.questions ?? []).map((question) => ({
        id: question.id,
        questionText: question.questionText,
        questionType: fromPrismaQuestionType(question.questionType),
        options: question.options ?? undefined,
        rubric: question.rubric ?? undefined,
      })),
    })),
  };
}

function assertCandidateAccessOpen(session: CandidateSessionRow): void {
  const status = fromPrismaSessionStatus(session.status);
  if (status === "completed" || status === "expired") {
    throw forbiddenResourceError("Session no longer available");
  }
  if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
    throw forbiddenResourceError("Session no longer available");
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
  return `EV-${randomInt(100000, 1000000)}`;
}
