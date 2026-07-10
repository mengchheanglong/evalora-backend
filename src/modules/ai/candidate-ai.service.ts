import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { forbiddenResourceError } from "../auth/access-control";
import { AiService } from "./ai.service";

@Injectable()
export class CandidateAiService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiService) private readonly aiService: AiService,
  ) {}

  async conversation(accessCode: string) {
    const session = await this.findOpenSession(accessCode);
    const messages = await this.prisma.aIMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, createdAt: true },
    });
    return messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString() }));
  }

  async interviewQuestion(accessCode: string, input: { conversationHistory?: string[]; rubric?: string[] }) {
    const session = await this.findOpenSession(accessCode);
    const module = session.template.modules[0];
    if (!module) throw forbiddenResourceError("AI interview module");
    const previous = await this.prisma.aIMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { content: true },
    });
    const generated = await this.aiService.generateInterviewQuestion({
      roleType: session.template.roleType,
      templateTitle: session.template.title,
      moduleTitle: module.title,
      conversationHistory: input.conversationHistory?.slice(-10) ?? previous.reverse().map((message) => message.content),
      rubric: safeStringArray(input.rubric, 10),
    });
    await this.prisma.aIMessage.create({
      data: { sessionId: session.id, role: "assistant", content: generated.question, metadata: { provider: generated.provider, rubric: generated.rubric } },
    });
    return generated;
  }

  async followUp(accessCode: string, input: { question?: string; answer?: string; rubric?: string[] }) {
    const session = await this.findOpenSession(accessCode);
    const question = requiredText(input.question, "Question is required.", 4_000);
    const answer = requiredText(input.answer, "Answer is required.", 12_000);
    const generated = await this.aiService.generateFollowUp({ question, answer, rubric: safeStringArray(input.rubric, 10) });
    await this.prisma.$transaction([
      this.prisma.aIMessage.create({ data: { sessionId: session.id, role: "candidate", content: answer, metadata: { question } } }),
      this.prisma.aIMessage.create({ data: { sessionId: session.id, role: "assistant", content: generated.question, metadata: { provider: generated.provider, basedOn: generated.basedOn } } }),
    ]);
    return generated;
  }

  private async findOpenSession(accessCode: string) {
    const session = await this.prisma.interviewSession.findFirst({
      where: { accessCode: normalizeAccessCode(accessCode) },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        template: {
          select: {
            title: true,
            roleType: true,
            modules: { where: { moduleType: "AI_INTERVIEW" }, orderBy: { orderIndex: "asc" }, take: 1, select: { title: true } },
          },
        },
      },
    });
    if (!session || session.status !== "IN_PROGRESS" || (session.expiresAt && session.expiresAt.getTime() < Date.now())) {
      throw forbiddenResourceError("Active interview session");
    }
    return session;
  }
}

function normalizeAccessCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) throw forbiddenResourceError("Access code");
  return normalized;
}

function requiredText(value: string | undefined, message: string, maxLength: number): string {
  const normalized = value?.trim();
  if (!normalized) throw new BadRequestException(message);
  if (normalized.length > maxLength) throw new BadRequestException(`Text must be ${maxLength.toLocaleString()} characters or fewer.`);
  return normalized;
}

function safeStringArray(value: string[] | undefined, maxItems: number): string[] | undefined {
  const normalized = value?.slice(0, maxItems).map((item) => item.trim().slice(0, 200)).filter(Boolean);
  return normalized?.length ? normalized : undefined;
}
