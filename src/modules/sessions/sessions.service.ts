import { Injectable } from "@nestjs/common";
import { randomInt } from "node:crypto";
import type { InterviewSessionDto, SessionStatus } from "../../domain/evalora.types";
import { buildSessionOwnershipWhere, forbiddenResourceError, mergeWhere, requireOrganizationId, type AccessContext } from "../auth/access-control";

type PrismaSessionStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED";

interface SessionUserRow {
  name: string;
  email?: string;
}

interface SessionTemplateRow {
  title: string;
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

type SessionCreateFn = (args: any) => Promise<SessionRow>;
type SessionFindManyFn = (args: any) => Promise<SessionRow[]>;
type SessionFindUniqueFn = (args: any) => Promise<SessionRow | null>;
type SessionFindFirstFn = (args: any) => Promise<SessionRow | null>;
type SessionUpdateFn = (args: any) => Promise<SessionRow>;

interface SessionPrismaClient {
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

interface SessionsServiceOptions {
  generateAccessCode?: () => string;
  now?: () => Date;
}

export const SESSION_INCLUDE = {
  candidate: { select: { name: true, email: true } },
  template: { select: { title: true } },
};

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
    const session = await create({
      data: {
        candidateId: requireNonEmpty(input.candidateId, "Candidate id is required."),
        templateId: requireNonEmpty(input.templateId, "Template id is required."),
        organizationId: resolveWritableOrganizationId(input.organizationId, access),
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
      return session ? toSessionDto(session) : null;
    }

    const findUnique = requireMethod(this.prisma.interviewSession.findUnique, "interviewSession.findUnique");
    const session = await findUnique({
      where: { id },
      include: SESSION_INCLUDE,
    });

    return session ? toSessionDto(session) : null;
  }

  async startSession(id: string, access?: AccessContext): Promise<InterviewSessionDto> {
    await this.assertSessionAccess(id, access);

    const update = requireMethod(this.prisma.interviewSession.update, "interviewSession.update");
    const session = await update({
      where: { id },
      data: { status: "IN_PROGRESS", startedAt: this.now() },
      include: SESSION_INCLUDE,
    });

    return toSessionDto(session);
  }

  async completeSession(id: string, access?: AccessContext): Promise<InterviewSessionDto> {
    await this.assertSessionAccess(id, access);

    const update = requireMethod(this.prisma.interviewSession.update, "interviewSession.update");
    const session = await update({
      where: { id },
      data: { status: "COMPLETED", completedAt: this.now() },
      include: SESSION_INCLUDE,
    });

    return toSessionDto(session);
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
