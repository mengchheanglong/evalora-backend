import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DEFAULT_LIST_LIMIT } from "../../common/query.constants";
import { buildSessionOwnershipWhere, forbiddenResourceError, mergeWhere, type AccessContext } from "../auth/access-control";
import { INTERVIEW_EVENTS, type InterviewEventPublisher } from "../realtime/realtime.types";
import { CODE_QUESTION_INDEX } from "../code/constants/code.constants";
import { canManageSessionFollowUps } from "../sessions/interviewer-assignment";
import {
  ANSWER_TEXT_MAX,
  QUESTION_TEXT_MAX,
  QUESTION_TEXT_MIN,
  toCandidateFollowUpDto,
  toInterviewerFollowUpDto,
  type AnswerInterviewerFollowUpInput,
  type InterviewerFollowUpDto,
  type InterviewerFollowUpRow,
  type SendInterviewerFollowUpInput,
} from "./interviewer-follow-ups.types";

type PrismaSessionStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED";

interface SessionRow {
  id: string;
  createdById?: string | null;
  interviewers?: unknown;
  status: PrismaSessionStatus;
  expiresAt?: Date | null;
  template?: {
    modules?: Array<{ id: string; moduleType: string; questions?: Array<{ id: string }> | null }> | null;
  } | null;
  aiMessages?: Array<{ role: string; metadata?: unknown }> | null;
}

/** Narrow client surface so the service is unit-testable with a plain object. */
export interface InterviewerFollowUpPrismaClient {
  interviewSession: {
    findFirst(args: unknown): Promise<SessionRow | null>;
  };
  interviewerFollowUp: {
    findMany(args: unknown): Promise<InterviewerFollowUpRow[]>;
    findFirst(args: unknown): Promise<InterviewerFollowUpRow | null>;
    create(args: unknown): Promise<InterviewerFollowUpRow>;
    update(args: unknown): Promise<InterviewerFollowUpRow>;
    count(args: unknown): Promise<number>;
    aggregate?(args: unknown): Promise<{ _max?: { sequence?: number | null } | null }>;
  };
}

const ASKED_BY_SELECT = { select: { id: true, name: true } };

@Injectable()
export class InterviewerFollowUpsService {
  constructor(
    private readonly prisma: InterviewerFollowUpPrismaClient,
    private readonly events?: InterviewEventPublisher,
  ) {}

  /** Fire-and-forget: a transport failure must never fail a committed write. */
  private publish(sessionId: string, event: string, payload: unknown) {
    try {
      this.events?.emitToSession(sessionId, event, payload);
    } catch {
      // Clients still recover via REST / re-join snapshot.
    }
  }

  // ---------------------------------------------------------------- interviewer

  async listForSession(sessionId: string, access?: AccessContext): Promise<InterviewerFollowUpDto[]> {
    await this.loadAccessibleSession(sessionId, access);
    const rows = await this.prisma.interviewerFollowUp.findMany({
      where: { sessionId },
      include: { askedBy: ASKED_BY_SELECT },
      orderBy: { sequence: "asc" },
      take: DEFAULT_LIST_LIMIT,
    });
    return rows.map(toInterviewerFollowUpDto);
  }

  async send(sessionId: string, input: SendInterviewerFollowUpInput, access?: AccessContext): Promise<InterviewerFollowUpDto> {
    const askedById = access?.userId;
    if (!askedById) throw new ForbiddenException("A signed-in workspace user is required to send a follow-up.");

    const session = await this.loadAccessibleSession(sessionId, access, { withTemplate: true });
    this.assertCanManageFollowUps(session, access);
    // Questions may only be sent while the candidate is actively working.
    if (session.status !== "IN_PROGRESS") {
      throw new ConflictException("This session no longer accepts questions.");
    }

    const questionText = requireQuestionText(input.questionText);
    const { moduleId, parentQuestionId } = this.resolveParentRefs(session, input);
    const idempotencyKey = optionalTrimmed(input.idempotencyKey);

    // Retry-safe: a repeated send with the same key returns the original record
    // instead of queueing a duplicate question for the candidate.
    if (idempotencyKey) {
      const existing = await this.prisma.interviewerFollowUp.findFirst({
        where: { sessionId, idempotencyKey },
        include: { askedBy: ASKED_BY_SELECT },
      });
      if (existing) return toInterviewerFollowUpDto(existing);
    }

    const sequence = (await this.maxSequence(sessionId)) + 1;

    try {
      const created = await this.prisma.interviewerFollowUp.create({
        data: {
          sessionId,
          moduleId,
          parentQuestionId,
          askedById,
          questionText,
          required: input.required !== false,
          sequence,
          status: "SENT",
          idempotencyKey,
        },
        include: { askedBy: ASKED_BY_SELECT },
      });
      const dto = toInterviewerFollowUpDto(created);
      this.publish(sessionId, INTERVIEW_EVENTS.questionSent, { sessionId, followUp: dto });
      return dto;
    } catch (error) {
      // Lost an idempotency race: the winning insert already created the record.
      if (isUniqueViolation(error) && idempotencyKey) {
        const existing = await this.prisma.interviewerFollowUp.findFirst({
          where: { sessionId, idempotencyKey },
          include: { askedBy: ASKED_BY_SELECT },
        });
        if (existing) return toInterviewerFollowUpDto(existing);
      }
      throw error;
    }
  }

  async cancel(sessionId: string, followUpId: string, access?: AccessContext): Promise<InterviewerFollowUpDto> {
    const session = await this.loadAccessibleSession(sessionId, access);
    this.assertCanManageFollowUps(session, access);
    const followUp = await this.prisma.interviewerFollowUp.findFirst({
      where: { id: followUpId, sessionId },
      include: { askedBy: ASKED_BY_SELECT },
    });
    if (!followUp) throw new NotFoundException("Follow-up question not found.");
    if (followUp.status === "CANCELLED") return toInterviewerFollowUpDto(followUp);
    // An answered question is evidence — it stays in the record.
    if (followUp.status === "ANSWERED") {
      throw new ConflictException("This question was already answered and cannot be cancelled.");
    }

    const updated = await this.prisma.interviewerFollowUp.update({
      where: { id: followUpId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
      include: { askedBy: ASKED_BY_SELECT },
    });
    const dto = toInterviewerFollowUpDto(updated);
    this.publish(sessionId, INTERVIEW_EVENTS.questionCancelled, { sessionId, followUpId: dto.id, followUp: dto });
    return dto;
  }

  // ------------------------------------------------------------------ candidate

  async listByAccessCode(accessCode: string) {
    const session = await this.loadCandidateSession(accessCode);
    const rows = await this.prisma.interviewerFollowUp.findMany({
      where: { sessionId: session.id },
      include: { askedBy: ASKED_BY_SELECT },
      orderBy: { sequence: "asc" },
      take: DEFAULT_LIST_LIMIT,
    });
    return rows.map(toCandidateFollowUpDto);
  }

  async answerByAccessCode(accessCode: string, followUpId: string, input: AnswerInterviewerFollowUpInput) {
    const session = await this.loadCandidateSession(accessCode);
    if (session.status !== "IN_PROGRESS") {
      throw forbiddenResourceError("This assessment is no longer available");
    }

    const followUp = await this.prisma.interviewerFollowUp.findFirst({
      where: { id: followUpId, sessionId: session.id },
      include: { askedBy: ASKED_BY_SELECT },
    });
    if (!followUp) throw new NotFoundException("Follow-up question not found.");
    if (followUp.status === "CANCELLED") {
      throw new ConflictException("This question was withdrawn by the interviewer.");
    }

    const submit = input.submit === true;
    const answerText = (input.answerText ?? "").slice(0, ANSWER_TEXT_MAX);

    // Re-submitting an answered question is a no-op rather than an error, so a
    // retried request from a flaky connection stays safe.
    if (followUp.status === "ANSWERED") return toCandidateFollowUpDto(followUp);

    if (submit && !answerText.trim()) {
      throw new BadRequestException("Write an answer before sending it to your interviewer.");
    }

    const now = new Date();
    const updated = await this.prisma.interviewerFollowUp.update({
      where: { id: followUpId },
      data: submit
        ? { answerText, status: "ANSWERED", answerSavedAt: now, answeredAt: now }
        : { answerText, answerSavedAt: now },
      include: { askedBy: ASKED_BY_SELECT },
    });
    // Only a submitted answer is broadcast — an autosaved draft stays private
    // until the candidate chooses to send it.
    if (submit) {
      this.publish(session.id, INTERVIEW_EVENTS.questionAnswered, {
        sessionId: session.id,
        followUpId: updated.id,
        status: "answered",
        answerText: updated.answerText ?? "",
      });
    }
    return toCandidateFollowUpDto(updated);
  }

  // ------------------------------------------------------------------- shared

  private async maxSequence(sessionId: string): Promise<number> {
    const aggregate = this.prisma.interviewerFollowUp.aggregate;
    if (aggregate) {
      const result = await aggregate.call(this.prisma.interviewerFollowUp, {
        where: { sessionId },
        _max: { sequence: true },
      });
      return result?._max?.sequence ?? 0;
    }
    return this.prisma.interviewerFollowUp.count({ where: { sessionId } });
  }

  private async loadAccessibleSession(
    sessionId: string,
    access?: AccessContext,
    options: { withTemplate?: boolean } = {},
  ): Promise<SessionRow> {
    const session = await this.prisma.interviewSession.findFirst({
      where: mergeWhere({ id: sessionId }, buildSessionOwnershipWhere(access)),
      ...(options.withTemplate
        ? {
            include: {
              template: {
                select: {
                  modules: {
                    select: { id: true, moduleType: true, questions: { select: { id: true } } },
                  },
                },
              },
              aiMessages: { select: { role: true, metadata: true } },
            },
          }
        : {}),
    });
    if (!session) throw forbiddenResourceError("Session");
    return session;
  }

  private async loadCandidateSession(accessCode: string): Promise<SessionRow> {
    const normalized = (accessCode ?? "").trim().toUpperCase();
    if (!normalized) throw new BadRequestException("Access code is required.");
    const session = await this.prisma.interviewSession.findFirst({ where: { accessCode: normalized } });
    if (!session) throw forbiddenResourceError("Session");
    if (session.status === "COMPLETED" || session.status === "EXPIRED") {
      throw forbiddenResourceError("This assessment is no longer available");
    }
    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
      throw forbiddenResourceError("This assessment is no longer available");
    }
    return session;
  }

  private assertCanManageFollowUps(session: SessionRow, access?: AccessContext): void {
    if (canManageSessionFollowUps(session, access)) return;
    throw new ForbiddenException("Only assigned interviewers can send or withdraw live follow-up questions.");
  }

  /** A follow-up may reference an authored question or a generated interview turn. */
  private resolveParentRefs(session: SessionRow, input: SendInterviewerFollowUpInput) {
    const moduleId = optionalTrimmed(input.moduleId);
    const parentQuestionId = optionalTrimmed(input.parentQuestionId);
    const modules = session.template?.modules ?? [];

    if (moduleId && !modules.some((module) => module.id === moduleId)) {
      throw new BadRequestException("That module does not belong to this session's assessment.");
    }
    if (parentQuestionId) {
      const owner = modules.find((module) => (module.questions ?? []).some((question) => question.id === parentQuestionId));
      const codeOwner = modules.find(
        (module) => module.moduleType === "CODING" && CODE_QUESTION_INDEX.has(parentQuestionId),
      );
      const generatedOwner = modules.find((module) => {
        if (moduleId && module.id !== moduleId) return false;
        return (session.aiMessages ?? []).some((message) => {
          if (message.role !== "assistant") return false;
          const metadata = jsonRecord(message.metadata);
          if (metadata.questionId !== parentQuestionId) return false;
          return typeof metadata.moduleId === "string"
            ? metadata.moduleId === module.id
            : module.moduleType === "AI_INTERVIEW";
        });
      });
      const resolvedOwner = owner ?? codeOwner ?? generatedOwner;
      if (!resolvedOwner) throw new BadRequestException("That question does not belong to this session's assessment.");
      if (moduleId && resolvedOwner.id !== moduleId) {
        throw new BadRequestException("That question does not belong to the selected module.");
      }
      return { moduleId: moduleId ?? resolvedOwner.id, parentQuestionId };
    }
    return { moduleId, parentQuestionId };
  }
}

function requireQuestionText(value?: string): string {
  const text = (value ?? "").trim();
  if (text.length < QUESTION_TEXT_MIN) throw new BadRequestException("Write a follow-up question before sending it.");
  if (text.length > QUESTION_TEXT_MAX) throw new BadRequestException(`Keep the question under ${QUESTION_TEXT_MAX} characters.`);
  return text;
}

function optionalTrimmed(value?: string): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : undefined;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
