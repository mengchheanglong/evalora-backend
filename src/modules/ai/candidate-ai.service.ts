import { BadRequestException, Inject, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { forbiddenResourceError } from "../auth/access-control";
import { AiService, deterministicFollowUpDecision, type FollowUpInput, type GeneratedFollowUp } from "./ai.service";
import { createDeepSeekProviderFromEnv, DeepSeekAiProvider, type DeepSeekDeltaHandler } from "./deepseek.provider";
import { basedOnQuestionByAssistantId } from "../../common/ai-message-provenance";
import { readStructuredAiFollowUp } from "../../common/embedded-follow-up";

export interface FollowUpStreamHandler {
  /** Appends text to whatever the candidate is already reading. */
  onDelta: DeepSeekDeltaHandler;
  /**
   * Replaces everything streamed so far with `text`. Needed because a stream that
   * stops mid-clause leaves a half-written question on screen, and appending a second
   * question to it produces one unreadable run-on sentence.
   */
  onReplace: (text: string) => void;
}

@Injectable()
export class CandidateAiService {
  private readonly adaptiveSaveLocks = new Map<string, Promise<void>>();
  private readonly streamingProvider: DeepSeekAiProvider;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiService) private readonly aiService: AiService,
    // Streaming needs the provider itself, not the buffered AiService wrapper. The
    // provider is not a module provider, so it is built from the environment here.
    @Optional() @Inject(DeepSeekAiProvider) streamingProvider?: DeepSeekAiProvider,
  ) {
    this.streamingProvider = streamingProvider ?? createDeepSeekProviderFromEnv();
  }

  async conversation(accessCode: string) {
    const session = await this.findOpenSession(accessCode);
    const messages = await this.prisma.aIMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, createdAt: true, metadata: true },
    });
    const basedOnQuestion = basedOnQuestionByAssistantId(messages);
    return messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      // Lets the candidate app put a restored follow-up back under the answer it
      // belongs to without the question being copied onto that answer. Nothing else
      // from metadata is exposed to a candidate: it also carries the scoring rubric.
      basedOnQuestion: basedOnQuestion.get(message.id),
    }));
  }

  async interviewQuestion(accessCode: string, input: { conversationHistory?: string[]; rubric?: string[] }) {
    const session = await this.findOpenSession(accessCode);
    const module = session.template.modules.find((candidate) => candidate.moduleType === "AI_INTERVIEW");
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

  async followUp(accessCode: string, input: { questionId?: string; moduleId?: string; question?: string; answer?: string; rubric?: string[] }) {
    const session = await this.findOpenSession(accessCode);
    const provenance = this.resolveFollowUpProvenance(session, input);
    const question = requiredText(input.question, "Question is required.", 4_000);
    const answer = requiredText(input.answer, "Answer is required.", 12_000);
    const generated = await this.aiService.generateFollowUp({ question, answer, rubric: safeStringArray(input.rubric, 10) });
    if (generated.shouldAsk === false || !generated.question.trim()) return generated;
    const generatedQuestionId = generatedFollowUpId(provenance.questionId);
    await this.prisma.$transaction([
      this.prisma.aIMessage.create({ data: { sessionId: session.id, role: "candidate", content: answer, metadata: { question, ...provenance } } }),
      // Both rows share the transaction timestamp, so the probe cannot be tied back to
      // the question it came from by ordering. Naming that question here is what lets a
      // reader pair them without the candidate app copying the probe onto the answer.
      this.prisma.aIMessage.create({
        data: {
          sessionId: session.id,
          role: "assistant",
          content: generated.question,
          metadata: {
            provider: generated.provider,
            basedOn: generated.basedOn,
            basedOnQuestion: question,
            ...provenance,
            ...(generatedQuestionId ? { questionId: generatedQuestionId } : {}),
          },
        },
      }),
    ]);
    return generated;
  }

  /**
   * Same contract as followUp, but the question is delivered token by token while the
   * model writes it. Access gating and validation run before the first delta so a
   * rejected request can still fail as a normal HTTP error.
   *
   * The streamed text is only a preview: this method resolves after the question is
   * stored, so the caller can treat its return value as the commit point and never
   * hand the candidate a question that has no row behind it.
   */
  async followUpStream(
    accessCode: string,
    input: { questionId?: string; moduleId?: string; question?: string; answer?: string; rubric?: string[] },
    handler: FollowUpStreamHandler,
  ): Promise<GeneratedFollowUp> {
    const session = await this.findOpenSession(accessCode);
    const provenance = this.resolveFollowUpProvenance(session, input);
    const question = requiredText(input.question, "Question is required.", 4_000);
    const answer = requiredText(input.answer, "Answer is required.", 12_000);

    const generated = await this.streamFollowUpQuestion({ question, answer, rubric: safeStringArray(input.rubric, 10) }, handler);
    if (!generated.shouldAsk) return generated;
    await this.persistStreamedFollowUp(session.id, { question, answer, generated, provenance });
    return generated;
  }

  /**
   * The candidate is already reading the question by the time this runs, so a brief
   * database blip must not be the difference between an answered question and no
   * record of it. Both rows stay in one transaction - retrying a partial write would
   * leave an orphan answer - and the retries are what make the late failure survivable.
   */
  private async persistStreamedFollowUp(
    sessionId: string,
    context: {
      question: string;
      answer: string;
      generated: GeneratedFollowUp;
      provenance: { questionId?: string; moduleId?: string };
    },
  ): Promise<void> {
    const { question, answer, generated, provenance } = context;
    const generatedQuestionId = generatedFollowUpId(provenance.questionId);
    for (let attempt = 1; attempt <= FOLLOW_UP_PERSIST_ATTEMPTS; attempt += 1) {
      try {
        await this.prisma.$transaction([
          this.prisma.aIMessage.create({ data: { sessionId, role: "candidate", content: answer, metadata: { question, ...provenance } } }),
          this.prisma.aIMessage.create({
            data: {
              sessionId,
              role: "assistant",
              content: generated.question,
              metadata: {
                provider: generated.provider,
                basedOn: generated.basedOn,
                basedOnQuestion: question,
                streamed: true,
                ...provenance,
                ...(generatedQuestionId ? { questionId: generatedQuestionId } : {}),
              },
            },
          }),
        ]);
        return;
      } catch {
        if (attempt >= FOLLOW_UP_PERSIST_ATTEMPTS) break;
        await delay(FOLLOW_UP_PERSIST_RETRY_MS * attempt);
      }
    }

    // Every retry failed, so the candidate must not be left answering an unsaved
    // question. The caller withdraws the preview and shows this message instead.
    throw new ServiceUnavailableException("We could not save this question. Please send your answer again in a moment.");
  }

  private async streamFollowUpQuestion(input: FollowUpInput, handler: FollowUpStreamHandler): Promise<GeneratedFollowUp> {
    const basedOn = input.answer ? "candidate_answer" : "default_follow_up";
    let emitted = "";
    const bufferedDeltas: string[] = [];
    const onDelta: DeepSeekDeltaHandler = (text) => {
      emitted += text;
      bufferedDeltas.push(text);
    };

    try {
      const streamed = await this.streamingProvider.streamFollowUp(input, onDelta);
      if (streamed.text.trim().toUpperCase() === NO_FOLLOW_UP_SENTINEL) {
        return { shouldAsk: false, question: "", basedOn, provider: "deepseek" };
      }
      const usable = usableStreamedQuestion(streamed.text, streamed.truncated);
      if (usable) {
        if (usable === emitted.trim()) {
          for (const delta of bufferedDeltas) handler.onDelta(delta);
        } else {
          handler.onReplace(usable);
        }
        return { shouldAsk: true, question: usable, basedOn, provider: "deepseek" };
      }
    } catch {
      // Falls through to the deterministic decision below.
    }

    const fallback = deterministicFollowUpDecision(input);
    if (!fallback.shouldAsk) return fallback;
    for (const delta of splitIntoDeltas(fallback.question)) handler.onDelta(delta);
    return fallback;
  }

  /**
   * Generates a short set of interview questions tailored to what the candidate
   * already answered in the earlier modules. Runs at the end of the assessment so
   * the AI can adapt to the candidate's own responses. Falls back to deterministic
   * questions when the provider is unavailable, so it never blocks the candidate.
   */
  async existingAdaptiveQuestions(accessCode: string): Promise<{ questions: string[]; provider: string }> {
    const session = await this.findOpenSession(accessCode);
    const messages = await this.prisma.aIMessage.findMany({
      where: { sessionId: session.id, role: "assistant" },
      orderBy: { createdAt: "asc" },
      select: { content: true, metadata: true },
    });
    const adaptiveMessages = messages.filter((message) => isAdaptiveMetadata(message.metadata));
    return {
      questions: adaptiveMessages.map((message) => message.content),
      provider: providerFromMetadata(adaptiveMessages.at(-1)?.metadata) ?? "fallback",
    };
  }

  async adaptiveQuestions(accessCode: string, count = 3): Promise<{ questions: string[]; provider: string }> {
    const session = await this.findOpenSession(accessCode);
    const [responses, priorMessages, interviewerFollowUps, codeSubmissions] = await Promise.all([
      this.prisma.response.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: "asc" },
        select: { responseText: true, responseJson: true, question: { select: { questionText: true } } },
      }),
      this.prisma.aIMessage.findMany({
        where: { sessionId: session.id, role: "assistant" },
        orderBy: { createdAt: "asc" },
        select: { content: true, metadata: true },
      }),
      this.prisma.interviewerFollowUp?.findMany?.({
        where: { sessionId: session.id, status: "ANSWERED" },
        orderBy: { sequence: "asc" },
        select: { questionText: true, answerText: true, askedBy: { select: { name: true } } },
      }) ?? Promise.resolve([]),
      this.prisma.codeSubmission?.findMany?.({
        where: { sessionId: session.id },
        orderBy: { createdAt: "asc" },
        select: { questionId: true, language: true, sourceCode: true, stdout: true, stderr: true, score: true },
      }) ?? Promise.resolve([]),
    ]);
    const history = [
      ...compactAdaptiveHistory(responses),
      ...compactInterviewerHistory(interviewerFollowUps),
      ...compactCodeHistory(codeSubmissions),
    ];

    const moduleTitle = session.template.modules.find((module) => module.moduleType === "AI_INTERVIEW")?.title ?? "Adaptive interview";
    const target = Math.min(Math.max(1, Math.trunc(count) || 3), 5);
    const existing = priorMessages.filter((message) => isAdaptiveMetadata(message.metadata));
    const questions = existing.slice(0, target).map((message) => message.content);
    let provider = providerFromMetadata(existing.at(-1)?.metadata) ?? "fallback";

    const missingIndexes = Array.from({ length: target - questions.length }, (_, offset) => questions.length + offset);
    const generatedQuestions = await Promise.all(
      missingIndexes.map(async (index) => ({
        index,
        generated: await this.aiService.generateInterviewQuestion({
          roleType: session.template.roleType,
          templateTitle: session.template.title,
          moduleTitle,
          conversationHistory: [
            ...history,
            ...questions.map((question) => `Already asked: ${question}`),
            adaptiveQuestionFocus(index),
          ],
        }),
      })),
    );

    for (const { index, generated } of generatedQuestions) {
      const proposedQuestion = generated.provider === "fallback"
        ? adaptiveFallbackQuestion(index, session.template.roleType)
        : generated.question.trim();
      const question = proposedQuestion && !questions.includes(proposedQuestion)
        ? proposedQuestion
        : adaptiveFallbackQuestion(index, session.template.roleType);
      questions.push(question);
      provider = generated.provider;
      await this.prisma.aIMessage.create({
        data: {
          sessionId: session.id,
          role: "assistant",
          content: question,
          metadata: { adaptive: true, questionId: `ai-adaptive-${index}`, provider: generated.provider },
        },
      });
    }

    return { questions, provider };
  }

  /** Persists a candidate's answer to an adaptive (AI-generated) question as both
   *  an AI transcript message and a session response for the reviewer report. */
  async saveAdaptiveAnswer(
    accessCode: string,
    input: { questionId?: string; question?: string; answer?: string; followUpQuestion?: string; followUpAnswer?: string },
  ) {
    const session = await this.findOpenSession(accessCode);
    const questionId = requiredAdaptiveQuestionId(input.questionId);
    const question = requiredText(input.question, "Question is required.", 4_000);
    const answer = requiredText(input.answer, "Answer is required.", 12_000);
    const followUpQuestion = optionalText(input.followUpQuestion, 4_000);
    const followUpAnswer = optionalText(input.followUpAnswer, 12_000);
    if (followUpAnswer && !followUpQuestion) throw new BadRequestException("The AI follow-up question is required.");

    return this.withAdaptiveSaveLock(`${session.id}:${questionId}`, async () => {
      await this.persistAdaptiveAnswer(session.id, questionId, question, answer, { followUpQuestion, followUpAnswer });
      return { saved: true };
    });
  }

  private async persistAdaptiveAnswer(
    sessionId: string,
    questionId: string,
    question: string,
    answer: string,
    followUp: { followUpQuestion?: string; followUpAnswer?: string },
  ): Promise<void> {
    const [generatedQuestions, adaptiveResponses] = await Promise.all([
      this.prisma.aIMessage.findMany({
        where: { sessionId, role: "assistant" },
        orderBy: { createdAt: "asc" },
        select: { content: true, metadata: true },
      }),
      this.prisma.response.findMany({
        where: { sessionId },
        select: { id: true, responseJson: true },
      }),
    ]);
    const assigned = generatedQuestions.some((message) =>
      isAdaptiveMetadata(message.metadata)
      && message.content === question
      && (adaptiveQuestionId(message.metadata) === questionId || !adaptiveQuestionId(message.metadata)),
    );
    if (!assigned) throw forbiddenResourceError("Adaptive interview question");

    // Only the candidate's own words go in the text column. The question is already
    // structured data on responseJson, and a reader cannot tell a model-authored
    // question from the candidate's answer once the two are glued into one string.
    const responseText = answer;
    const responseJson = {
      adaptive: true,
      questionId,
      question,
      ...(followUp.followUpQuestion
        ? { aiFollowUp: { question: followUp.followUpQuestion, answer: followUp.followUpAnswer ?? "" } }
        : {}),
    } as Prisma.InputJsonValue;
    const matchingResponses = adaptiveResponses.filter((response) => adaptiveQuestionId(response.responseJson) === questionId);
    const existing = matchingResponses[0];
    if (existing) {
      await this.prisma.response.update({
        where: { id: existing.id },
        data: { responseText, responseJson },
      });
      const duplicateIds = matchingResponses.slice(1).map((response) => response.id);
      if (duplicateIds.length) await this.prisma.response.deleteMany({ where: { id: { in: duplicateIds } } });
    } else {
      await this.prisma.$transaction([
        this.prisma.aIMessage.create({
          data: { sessionId, role: "candidate", content: answer, metadata: { questionId, question, adaptive: true } },
        }),
        this.prisma.response.create({
          data: { sessionId, responseText, responseJson },
        }),
      ]);
    }
  }

  private async withAdaptiveSaveLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.adaptiveSaveLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.adaptiveSaveLocks.set(key, tail);

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.adaptiveSaveLocks.get(key) === tail) this.adaptiveSaveLocks.delete(key);
    }
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
            modules: {
              orderBy: { orderIndex: "asc" },
              select: {
                id: true,
                title: true,
                moduleType: true,
                settings: true,
                questions: { select: { id: true, questionText: true } },
              },
            },
          },
        },
      },
    });
    if (!session || session.status !== "IN_PROGRESS" || (session.expiresAt && session.expiresAt.getTime() < Date.now())) {
      throw forbiddenResourceError("Active interview session");
    }
    return session;
  }

  private resolveFollowUpProvenance(
    session: Awaited<ReturnType<CandidateAiService["findOpenSession"]>>,
    input: { questionId?: string; moduleId?: string; question?: string },
  ): { questionId?: string; moduleId?: string } {
    const questionId = optionalText(input.questionId, 400);
    const moduleId = optionalText(input.moduleId, 400);
    if (!session.template.modules.some((candidate) => candidate.moduleType === "AI_INTERVIEW")) {
      throw forbiddenResourceError("AI follow-up");
    }
    if (!moduleId) return { questionId };
    const module = session.template.modules.find((candidate) => candidate.id === moduleId);
    if (!module) throw forbiddenResourceError("Interview module");
    if (
      questionId
      && !questionId.startsWith("ai-adaptive-")
      && !module.questions.some((question) => question.id === questionId)
    ) {
      throw forbiddenResourceError("Interview question");
    }
    return { questionId, moduleId };
  }
}

const NO_FOLLOW_UP_SENTINEL = "[NO_FOLLOW_UP]";
const FALLBACK_DELTA_PARTS = 4;
const FOLLOW_UP_PERSIST_ATTEMPTS = 3;
const FOLLOW_UP_PERSIST_RETRY_MS = 100;
// Shorter than this a trimmed stream is a scrap of a sentence, not a question worth
// asking, so the deterministic question reads better than whatever arrived.
const MIN_STREAMED_QUESTION_LENGTH = 20;

const ADAPTIVE_CONTEXT_BUDGET = 48_000;
const ADAPTIVE_MIN_ENTRY_LENGTH = 160;

interface AdaptiveResponseContext {
  responseText: string;
  responseJson?: unknown;
  question?: { questionText: string } | null;
}

export function compactAdaptiveHistory(responses: AdaptiveResponseContext[]): string[] {
  const entries = responses.flatMap((response) => {
    const answer = response.responseText?.trim();
    const question = response.question?.questionText?.trim() ?? metadataString(response.responseJson, "question");
    const followUp = readStructuredAiFollowUp(response.responseJson);
    const history: string[] = [];
    if (answer) history.push(question ? `Q: ${question}\nA: ${answer}` : `A: ${answer}`);
    if (followUp?.questionText && followUp.answerText) {
      history.push(`AI follow-up: ${followUp.questionText}\nCandidate: ${followUp.answerText}`);
    }
    return history;
  });
  if (!entries.length) return [];

  const entryLimit = Math.max(ADAPTIVE_MIN_ENTRY_LENGTH, Math.floor(ADAPTIVE_CONTEXT_BUDGET / entries.length));
  return entries.map((entry) => truncateText(entry, entryLimit));
}

interface InterviewerHistoryContext {
  questionText: string;
  answerText?: string | null;
  askedBy?: { name?: string | null } | null;
}

function compactInterviewerHistory(followUps: InterviewerHistoryContext[]): string[] {
  return followUps
    .map((followUp) => {
      const question = followUp.questionText?.trim();
      const answer = followUp.answerText?.trim();
      if (!question || !answer) return "";
      const interviewer = followUp.askedBy?.name?.trim() || "Interviewer";
      return truncateText(`${interviewer} follow-up: ${question}\nCandidate: ${answer}`, 2_000);
    })
    .filter(Boolean);
}

interface CodeHistoryContext {
  questionId: string;
  language: string;
  sourceCode: string;
  stdout?: string | null;
  stderr?: string | null;
  score?: unknown;
}

function compactCodeHistory(submissions: CodeHistoryContext[]): string[] {
  const latestByQuestion = new Map<string, CodeHistoryContext>();
  for (const submission of submissions) latestByQuestion.set(submission.questionId, submission);
  return [...latestByQuestion.values()].map((submission) => {
    const output = submission.stderr?.trim() || submission.stdout?.trim() || "No output";
    return truncateText(
      `Coding submission ${submission.questionId} (${submission.language}, score ${String(submission.score ?? "unscored")}):\n`
      + `${submission.sourceCode}\nResult: ${output}`,
      3_000,
    );
  });
}

/**
 * Decides what a candidate should end up reading when a stream was cut short.
 * A whole question the model actually wrote beats a generic one, so a truncated
 * stream is trimmed back to its last complete question and kept. Below that the
 * remainder is a dangling clause with no question in it, and the candidate is better
 * served by the deterministic question than by a fragment they cannot answer.
 */
function usableStreamedQuestion(text: string, truncated: boolean): string | undefined {
  const normalized = text.trim();
  if (!normalized) return undefined;
  if (!truncated) return normalized;

  const lastQuestionMark = normalized.lastIndexOf("?");
  if (lastQuestionMark === -1) return undefined;
  const completed = normalized.slice(0, lastQuestionMark + 1).trim();
  return completed.length >= MIN_STREAMED_QUESTION_LENGTH ? completed : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitIntoDeltas(text: string, parts = FALLBACK_DELTA_PARTS): string[] {
  const words = text.split(" ");
  const size = Math.max(1, Math.ceil(words.length / parts));
  const deltas: string[] = [];
  for (let index = 0; index < words.length; index += size) {
    const chunk = words.slice(index, index + size).join(" ");
    deltas.push(index === 0 ? chunk : ` ${chunk}`);
  }
  return deltas;
}

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}

function adaptiveFallbackQuestion(index: number, roleType: string): string {
  const role = roleType.trim() || "this role";
  const questions = [
    `Looking across your answers, which example best demonstrates your readiness for ${role}, and what measurable result supports it?`,
    "Which decision or trade-off from your earlier answers would you handle differently now, and why?",
    "What important skill for this role has not been demonstrated by your previous answers, and what concrete example would show it?",
    "Which assumption in one of your earlier answers carries the most risk, and how would you validate it?",
    "What follow-up evidence should an interviewer verify from your earlier answers?",
  ];
  return questions[index % questions.length];
}

function adaptiveQuestionFocus(index: number): string {
  const focusAreas = [
    "Adaptive question slot 1: probe the candidate's strongest claimed result and ask for measurable evidence.",
    "Adaptive question slot 2: probe an important decision, trade-off, inconsistency, or point of reflection.",
    "Adaptive question slot 3: probe a role-relevant competency or risk that the prior answers have not demonstrated.",
    "Adaptive question slot 4: probe how the candidate would validate a high-risk assumption from an earlier answer.",
    "Adaptive question slot 5: probe what evidence an interviewer should verify in a live follow-up.",
  ];
  return focusAreas[index % focusAreas.length];
}

function isAdaptiveMetadata(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).adaptive === true);
}

function metadataString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "string" && entry.trim() ? entry : undefined;
}

function providerFromMetadata(value: unknown): string | undefined {
  return metadataString(value, "provider");
}

function adaptiveQuestionId(value: unknown): string | undefined {
  return metadataString(value, "questionId");
}

function requiredAdaptiveQuestionId(value: string | undefined): string {
  const questionId = requiredText(value, "Adaptive question id is required.", 100);
  if (!/^ai-adaptive-\d+$/.test(questionId)) throw new BadRequestException("Adaptive question id is invalid.");
  return questionId;
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

function optionalText(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) throw new BadRequestException(`Text must be ${maxLength.toLocaleString()} characters or fewer.`);
  return normalized;
}

function generatedFollowUpId(parentQuestionId?: string): string | undefined {
  return parentQuestionId ? `ai-follow-up:${parentQuestionId}` : undefined;
}

function safeStringArray(value: string[] | undefined, maxItems: number): string[] | undefined {
  const normalized = value?.slice(0, maxItems).map((item) => item.trim().slice(0, 200)).filter(Boolean);
  return normalized?.length ? normalized : undefined;
}
