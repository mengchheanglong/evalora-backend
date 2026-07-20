import { ForbiddenException, Injectable } from "@nestjs/common";
import type { CandidateResponseDto, JsonValue } from "../../domain/evalora.types";
import { DEFAULT_LIST_LIMIT } from "../../common/query.constants";
import { buildSessionOwnershipWhere, forbiddenResourceError, mergeWhere, type AccessContext } from "../auth/access-control";
import { selectCandidateQuestions } from "../sessions/candidate-assignment";

interface ResponseRow {
  id: string;
  sessionId: string;
  questionId?: string | null;
  responseText: string;
  responseJson?: JsonValue | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

type PrismaSessionStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED";

interface ResponseSessionAccessRow {
  id: string;
  accessCode: string;
  status: PrismaSessionStatus;
  expiresAt?: Date | null;
}

type ResponseFindFirstFn = (args: any) => Promise<ResponseRow | null>;
type ResponseCreateFn = (args: any) => Promise<ResponseRow>;
type ResponseUpdateFn = (args: any) => Promise<ResponseRow>;
type ResponseUpsertFn = (args: any) => Promise<ResponseRow>;
type ResponseFindManyFn = (args: any) => Promise<ResponseRow[]>;
type SessionFindFirstFn = (args: any) => Promise<any | null>;

interface ResponsePrismaClient {
  interviewSession?: {
    findFirst?: SessionFindFirstFn;
  };
  response: {
    findFirst?: ResponseFindFirstFn;
    create?: ResponseCreateFn;
    update?: ResponseUpdateFn;
    upsert?: ResponseUpsertFn;
    findMany?: ResponseFindManyFn;
  };
}

export interface SaveResponseInput {
  sessionId?: string;
  questionId?: string;
  responseText?: string;
  responseJson?: JsonValue;
}

@Injectable()
export class ResponsesService {
  constructor(private readonly prisma: ResponsePrismaClient) {}

  async saveResponse(input: SaveResponseInput, access?: AccessContext): Promise<CandidateResponseDto> {
    const sessionId = requireNonEmpty(input.sessionId, "Session id is required.");
    const responseText = input.responseText ?? "";
    await this.assertSessionWritable(sessionId, access);
    const questionId = input.questionId;
    if (questionId) await this.assertQuestionAssigned(sessionId, questionId);

    // No linked question (non-candidate path): nothing to key idempotency on.
    if (!questionId) {
      return toResponseDto(await this.createResponse(sessionId, undefined, responseText, input.responseJson));
    }

    // Idempotent write keyed on the @@unique([sessionId, questionId]) index, so a
    // double-submit / autosave-plus-Save / network retry updates the same row
    // instead of inserting a duplicate. Replaces the old read-then-write (TOCTOU).
    const upsert = this.prisma.response.upsert;
    if (upsert) {
      try {
        return toResponseDto(
          await upsert({
            where: { sessionId_questionId: { sessionId, questionId } },
            create: { sessionId, questionId, responseText, responseJson: input.responseJson },
            update: { responseText, responseJson: input.responseJson },
          }),
        );
      } catch (error) {
        // Lost a concurrent insert race: the DB unique constraint rejected the
        // second insert (P2002). The row now exists — update it instead of erroring.
        if (isUniqueViolation(error)) {
          const existing = await this.findExistingResponse(sessionId, questionId);
          if (existing) return toResponseDto(await this.updateResponse(existing.id, responseText, input.responseJson));
        }
        throw error;
      }
    }

    // Fallback for clients/mocks without upsert (preserves the previous behavior).
    const existing = await this.findExistingResponse(sessionId, questionId);
    return toResponseDto(
      existing
        ? await this.updateResponse(existing.id, responseText, input.responseJson)
        : await this.createResponse(sessionId, questionId, responseText, input.responseJson),
    );
  }

  async listResponsesBySession(sessionId: string, access?: AccessContext): Promise<CandidateResponseDto[]> {
    const findMany = requireMethod(this.prisma.response.findMany, "response.findMany");
    const responses = await findMany({
      where: mergeWhere({ sessionId: requireNonEmpty(sessionId, "Session id is required.") }, buildResponseOwnershipWhere(access)),
      orderBy: { createdAt: "asc" },
      take: DEFAULT_LIST_LIMIT,
    });

    return responses.map(toResponseDto);
  }

  async saveResponseByAccessCode(accessCode: string, input: Omit<SaveResponseInput, "sessionId">): Promise<CandidateResponseDto> {
    const session = await this.findOpenSessionByAccessCode(accessCode);
    requireNonEmpty(input.questionId, "Question id is required.");
    return this.saveResponse({ ...input, sessionId: session.id });
  }

  async listResponsesByAccessCode(accessCode: string): Promise<CandidateResponseDto[]> {
    const session = await this.findOpenSessionByAccessCode(accessCode);
    return this.listResponsesBySession(session.id);
  }

  private async findOpenSessionByAccessCode(accessCode: string): Promise<ResponseSessionAccessRow> {
    const findFirst = requireMethod(this.prisma.interviewSession?.findFirst, "interviewSession.findFirst");
    const session = await findFirst({ where: { accessCode: normalizeAccessCode(accessCode) } });
    if (!session) throw forbiddenResourceError("Session");
    assertCandidateAccessOpen(session);
    return session;
  }

  private async assertSessionWritable(sessionId: string, access?: AccessContext): Promise<void> {
    const findFirst = requireMethod(this.prisma.interviewSession?.findFirst, "interviewSession.findFirst");
    const session = await findFirst({ where: mergeWhere({ id: sessionId }, access ? buildSessionOwnershipWhere(access) : undefined) });
    if (!session) throw forbiddenResourceError("Session");
    if (session.status !== "IN_PROGRESS") throw forbiddenResourceError("Responses require an in-progress session");
    assertCandidateAccessOpen(session);
  }

  private async assertQuestionAssigned(sessionId: string, questionId: string): Promise<void> {
    const findFirst = requireMethod(this.prisma.interviewSession?.findFirst, "interviewSession.findFirst");
    const session = await findFirst({
      where: { id: sessionId },
      select: {
        accessCode: true,
        template: {
          select: {
            modules: {
              select: { id: true, moduleType: true, questions: { select: { id: true } } },
            },
          },
        },
      },
    });
    if (!session) throw forbiddenResourceError("Session");
    const assignedIds = (session.template?.modules ?? []).flatMap((module: any) =>
      selectCandidateQuestions(module.questions ?? [], session.accessCode, module.id, module.moduleType === "CODING" ? 0 : (module.questions?.length ?? 0)).map((question) => question.id),
    );
    if (!assignedIds.includes(questionId)) throw forbiddenResourceError("Question");
  }

  private async findExistingResponse(sessionId: string, questionId: string): Promise<ResponseRow | null> {
    const findFirst = this.prisma.response.findFirst;
    if (!findFirst) return null;

    return findFirst({
      where: { sessionId, questionId },
      orderBy: { createdAt: "desc" },
    });
  }

  private async createResponse(sessionId: string, questionId: string | undefined, responseText: string, responseJson: JsonValue | undefined): Promise<ResponseRow> {
    const create = requireMethod(this.prisma.response.create, "response.create");
    return create({
      data: {
        sessionId,
        questionId,
        responseText,
        responseJson,
      },
    });
  }

  private async updateResponse(id: string, responseText: string, responseJson: JsonValue | undefined): Promise<ResponseRow> {
    const update = requireMethod(this.prisma.response.update, "response.update");
    return update({
      where: { id },
      data: {
        responseText,
        responseJson,
      },
    });
  }
}

function buildResponseOwnershipWhere(access?: AccessContext): Record<string, unknown> | undefined {
  const sessionScope = buildSessionOwnershipWhere(access);
  return Object.keys(sessionScope).length ? { session: sessionScope } : undefined;
}

/** Prisma unique-constraint violation (used to reconcile a concurrent insert race). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

function assertCandidateAccessOpen(session: ResponseSessionAccessRow): void {
  // A finished/expired assessment reads as a clean 403 with a standalone message —
  // not the awkward "<resource> not found or access denied." template.
  if (session.status === "COMPLETED" || session.status === "EXPIRED") {
    throw new ForbiddenException("This assessment is no longer available.");
  }
  if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
    throw new ForbiddenException("This assessment is no longer available.");
  }
}

function toResponseDto(response: ResponseRow): CandidateResponseDto {
  return {
    id: response.id,
    sessionId: response.sessionId,
    questionId: response.questionId ?? undefined,
    responseText: response.responseText,
    responseJson: response.responseJson ?? undefined,
    savedAt: toIso(response.updatedAt ?? response.createdAt),
    createdAt: toIso(response.createdAt),
  };
}

function toIso(value?: Date | null): string | undefined {
  return value ? value.toISOString() : undefined;
}

function normalizeAccessCode(accessCode: string): string {
  return requireNonEmpty(accessCode, "Access code is required.").toUpperCase();
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
