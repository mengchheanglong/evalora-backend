import { Injectable } from "@nestjs/common";
import type { CandidateResponseDto, JsonValue } from "../../domain/evalora.types";

interface ResponseRow {
  id: string;
  sessionId: string;
  questionId?: string | null;
  responseText: string;
  responseJson?: JsonValue | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

type ResponseFindFirstFn = (args: any) => Promise<ResponseRow | null>;
type ResponseCreateFn = (args: any) => Promise<ResponseRow>;
type ResponseUpdateFn = (args: any) => Promise<ResponseRow>;
type ResponseFindManyFn = (args: any) => Promise<ResponseRow[]>;

interface ResponsePrismaClient {
  response: {
    findFirst?: ResponseFindFirstFn;
    create?: ResponseCreateFn;
    update?: ResponseUpdateFn;
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

  async saveResponse(input: SaveResponseInput): Promise<CandidateResponseDto> {
    const sessionId = requireNonEmpty(input.sessionId, "Session id is required.");
    const responseText = input.responseText ?? "";

    const existing = input.questionId ? await this.findExistingResponse(sessionId, input.questionId) : null;
    const response = existing ? await this.updateResponse(existing.id, responseText, input.responseJson) : await this.createResponse(sessionId, input.questionId, responseText, input.responseJson);

    return toResponseDto(response);
  }

  async listResponsesBySession(sessionId: string): Promise<CandidateResponseDto[]> {
    const findMany = requireMethod(this.prisma.response.findMany, "response.findMany");
    const responses = await findMany({
      where: { sessionId: requireNonEmpty(sessionId, "Session id is required.") },
      orderBy: { createdAt: "asc" },
    });

    return responses.map(toResponseDto);
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

function requireNonEmpty(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function requireMethod<T extends (...args: any[]) => any>(method: T | undefined, name: string): T {
  if (!method) throw new Error(`${name} is not available.`);
  return method;
}
