import { ForbiddenException, Injectable } from "@nestjs/common";
import type { CandidateResponseDto, JsonValue } from "../../domain/evalora.types";
import { DEFAULT_LIST_LIMIT } from "../../common/query.constants";
import { buildSessionOwnershipWhere, forbiddenResourceError, mergeWhere, type AccessContext } from "../auth/access-control";

interface ResponseRow {
  id: string;
  sessionId: string;
  questionId?: string | null;
  responseText: string;
  responseJson?: JsonValue | null;
  questionSnapshot?: JsonValue | null;
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

/**
 * What the candidate was actually asked, recorded on their answer.
 *
 * Templates are mutable and carry no version, so question text and rubric read
 * live would silently re-label and re-score every past answer the moment a
 * prebuilt question is edited. This is the frozen copy the transcript and the
 * report scorer can trust.
 */
export interface QuestionSnapshot {
  /** Present only on private snapshots created after rubric restoration. */
  rubricVersion?: 1;
  questionText: string;
  rubric: string[];
  moduleTitle?: string;
  /** Lowercase wire vocabulary ("ai_interview"), as everywhere else. */
  moduleType?: string;
  weight?: number;
  capturedAt: string;
}

interface SnapshotQuestionRow {
  questionText?: string | null;
  rubric?: JsonValue | null;
  module?: {
    title?: string | null;
    moduleType?: string | null;
    weight?: number | null;
  } | null;
}

type ResponseFindFirstFn = (args: any) => Promise<ResponseRow | null>;
type ResponseCreateFn = (args: any) => Promise<ResponseRow>;
type ResponseUpdateFn = (args: any) => Promise<ResponseRow>;
type ResponseUpsertFn = (args: any) => Promise<ResponseRow>;
type ResponseFindManyFn = (args: any) => Promise<ResponseRow[]>;
type SessionFindFirstFn = (args: any) => Promise<any | null>;
type QuestionFindFn = (args: any) => Promise<SnapshotQuestionRow | null>;

interface ResponsePrismaClient {
  interviewSession?: {
    findFirst?: SessionFindFirstFn;
  };
  /** Optional so existing mocks keep working; present on the real client. */
  question?: {
    findUnique?: QuestionFindFn;
    findFirst?: QuestionFindFn;
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

    return this.persistQuestionResponse(sessionId, questionId, responseText, input.responseJson);
  }

  private async persistQuestionResponse(
    sessionId: string,
    questionId: string,
    responseText: string,
    responseJson: JsonValue | undefined,
  ): Promise<CandidateResponseDto> {
    // Read for its stored snapshot only — the write below is still the atomic
    // upsert, so this never decides create-vs-update and never reintroduces the
    // old TOCTOU race.
    const existing = await this.findExistingResponse(sessionId, questionId);
    const prepared = await this.prepareQuestionResponse(questionId, responseJson, existing);

    // Idempotent write keyed on the @@unique([sessionId, questionId]) index, so a
    // double-submit / autosave-plus-Save / network retry updates the same row
    // instead of inserting a duplicate. Replaces the old read-then-write (TOCTOU).
    const upsert = this.prisma.response.upsert;
    if (upsert) {
      try {
        const privateContext = prepared.questionSnapshot
          ? { questionSnapshot: prepared.questionSnapshot }
          : {};
        return toResponseDto(
          await upsert({
            where: { sessionId_questionId: { sessionId, questionId } },
            create: {
              sessionId,
              questionId,
              responseText,
              responseJson: prepared.responseJson,
              ...privateContext,
            },
            update: {
              responseText,
              responseJson: prepared.responseJson,
              ...privateContext,
            },
          }),
        );
      } catch (error) {
        // Lost a concurrent insert race: the DB unique constraint rejected the
        // second insert (P2002). The row now exists — update it instead of erroring.
        if (isUniqueViolation(error)) {
          const raced = await this.findExistingResponse(sessionId, questionId);
          // The race winner's snapshot is the one that was captured first, so it
          // is the one that survives.
          if (raced) {
            return toResponseDto(
              await this.updateResponse(
                raced.id,
                responseText,
                await this.prepareQuestionResponse(questionId, responseJson, raced),
              ),
            );
          }
        }
        throw error;
      }
    }

    // Fallback for clients/mocks without upsert (preserves the previous behavior).
    return toResponseDto(
      existing
        ? await this.updateResponse(existing.id, responseText, prepared)
        : await this.createResponse(
          sessionId,
          questionId,
          responseText,
          prepared.responseJson,
          prepared.questionSnapshot,
        ),
    );
  }

  /**
   * Keeps candidate-authored structured data separate from private scoring
   * context. Legacy snapshots stored inside responseJson are migrated into the
   * private column on the next save and removed from candidate-visible JSON.
   *
   * Captured once: a re-save keeps the snapshot the first save wrote, because the
   * record has to say what the candidate was asked when they answered — not what
   * the template says today.
   */
  private async prepareQuestionResponse(
    questionId: string,
    responseJson: JsonValue | undefined,
    existing: ResponseRow | null,
  ): Promise<{ responseJson?: JsonValue; questionSnapshot?: QuestionSnapshot }> {
    // A save that sends no JSON of its own used to leave the column untouched.
    // Now that a snapshot is written into it, the stored value has to be carried
    // forward explicitly or the write would replace an adaptive answer's fields
    // with nothing but the snapshot.
    const base = sanitizePublicResponseJson(
      responseJson === undefined ? (existing?.responseJson ?? undefined) : responseJson,
    );
    const snapshot = readQuestionSnapshot(existing?.questionSnapshot)
      ?? readLegacyQuestionSnapshot(existing?.responseJson)
      ?? (await this.loadQuestionSnapshot(questionId));
    return { responseJson: base, questionSnapshot: snapshot };
  }

  private async loadQuestionSnapshot(questionId: string): Promise<QuestionSnapshot | undefined> {
    const findQuestion = this.prisma.question?.findUnique ?? this.prisma.question?.findFirst;
    if (!findQuestion) return undefined;

    try {
      const question = await findQuestion({
        where: { id: questionId },
        select: {
          questionText: true,
          rubric: true,
          module: { select: { title: true, moduleType: true, weight: true } },
        },
      });
      if (!question) return undefined;

      return {
        rubricVersion: 1,
        questionText: question.questionText ?? "",
        rubric: toStringArray(question.rubric),
        moduleTitle: optionalString(question.module?.title),
        moduleType: question.module?.moduleType ? String(question.module.moduleType).toLowerCase() : undefined,
        weight: typeof question.module?.weight === "number" && Number.isFinite(question.module.weight) ? question.module.weight : undefined,
        capturedAt: new Date().toISOString(),
      };
    } catch {
      // The candidate's answer is the thing that must not be lost. A snapshot
      // that could not be read leaves the answer saved without one.
      return undefined;
    }
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
    const questionId = requireNonEmpty(input.questionId, "Question id is required.");
    const session = await this.findOpenSessionByAccessCode(accessCode, questionId);
    return this.persistQuestionResponse(session.id, questionId, input.responseText ?? "", input.responseJson);
  }

  async listResponsesByAccessCode(accessCode: string): Promise<CandidateResponseDto[]> {
    const findFirst = requireMethod(this.prisma.interviewSession?.findFirst, "interviewSession.findFirst");
    const session = await findFirst({
      relationLoadStrategy: "join",
      where: { accessCode: normalizeAccessCode(accessCode) },
      select: {
        id: true,
        accessCode: true,
        status: true,
        expiresAt: true,
        responses: {
          orderBy: { createdAt: "asc" },
          take: DEFAULT_LIST_LIMIT,
        },
      },
    });
    if (!session) throw forbiddenResourceError("Session");
    assertCandidateAccessOpen(session);
    return (session.responses as ResponseRow[]).map(toResponseDto);
  }

  private async findOpenSessionByAccessCode(accessCode: string, questionId?: string): Promise<ResponseSessionAccessRow> {
    const findFirst = requireMethod(this.prisma.interviewSession?.findFirst, "interviewSession.findFirst");
    const session = await findFirst({
      where: {
        accessCode: normalizeAccessCode(accessCode),
        ...(questionId
          ? { template: { modules: { some: { questions: { some: { id: questionId } } } } } }
          : {}),
      },
      select: { id: true, accessCode: true, status: true, expiresAt: true },
    });
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
      (module.questions ?? []).map((question: { id: string }) => question.id),
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

  private async createResponse(
    sessionId: string,
    questionId: string | undefined,
    responseText: string,
    responseJson: JsonValue | undefined,
    questionSnapshot?: QuestionSnapshot,
  ): Promise<ResponseRow> {
    const create = requireMethod(this.prisma.response.create, "response.create");
    return create({
      data: {
        sessionId,
        questionId,
        responseText,
        responseJson,
        ...(questionSnapshot ? { questionSnapshot } : {}),
      },
    });
  }

  private async updateResponse(
    id: string,
    responseText: string,
    prepared: { responseJson?: JsonValue; questionSnapshot?: QuestionSnapshot },
  ): Promise<ResponseRow> {
    const update = requireMethod(this.prisma.response.update, "response.update");
    const privateContext = prepared.questionSnapshot
      ? { questionSnapshot: prepared.questionSnapshot }
      : {};
    return update({
      where: { id },
      data: {
        responseText,
        responseJson: prepared.responseJson,
        ...privateContext,
      },
    });
  }
}

function buildResponseOwnershipWhere(access?: AccessContext): Record<string, unknown> | undefined {
  const sessionScope = buildSessionOwnershipWhere(access);
  return Object.keys(sessionScope).length ? { session: sessionScope } : undefined;
}

/** The snapshot an earlier save already wrote, returned exactly as it was stored. */
function readQuestionSnapshot(value: JsonValue | null | undefined): QuestionSnapshot | undefined {
  return isJsonObject(value) ? (value as unknown as QuestionSnapshot) : undefined;
}

/** Compatibility for rows created by the unfinished responseJson implementation. */
function readLegacyQuestionSnapshot(responseJson: JsonValue | null | undefined): QuestionSnapshot | undefined {
  if (!isJsonObject(responseJson)) return undefined;
  const snapshot = responseJson.questionSnapshot;
  if (!isJsonObject(snapshot)) return undefined;
  // Legacy snapshots used the defective sentence rubrics. Their wording remains
  // useful, but the absent version tells reports to use the corrected live rubric.
  return snapshot as unknown as QuestionSnapshot;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Rubric is a free-form Json column; only usable string criteria are kept. */
function toStringArray(value: JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function optionalString(value: unknown): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : undefined;
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
    responseJson: sanitizePublicResponseJson(response.responseJson),
    savedAt: toIso(response.updatedAt ?? response.createdAt),
    createdAt: toIso(response.createdAt),
  };
}

/**
 * Candidate JSON may hold choice/scale values and an AI follow-up answer, but
 * never server-authored scoring context. This runs on writes and reads so rows
 * created by the unfinished implementation stop leaking immediately.
 */
function sanitizePublicResponseJson(value: JsonValue | null | undefined): JsonValue | undefined {
  if (value == null) return undefined;
  if (!isJsonObject(value)) return value;

  const rest = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "questionSnapshot" && key !== "aiFollowUp"),
  );
  const safeFollowUp = sanitizeAiFollowUp(value.aiFollowUp);
  const sanitized = safeFollowUp ? { ...rest, aiFollowUp: safeFollowUp } : rest;
  return Object.keys(sanitized).length ? (sanitized as JsonValue) : undefined;
}

function sanitizeAiFollowUp(value: unknown): { question?: string; answer?: string } | undefined {
  if (!isJsonObject(value)) return undefined;
  const question = optionalString(value.question)?.slice(0, 4_000);
  const answer = optionalString(value.answer)?.slice(0, 12_000);
  return question || answer ? { question, answer } : undefined;
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
