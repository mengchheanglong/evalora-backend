import { Body, Controller, Get, HttpException, Inject, Param, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ValidateDto } from "../../common/pipes/validate-dto.pipe";
import { JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import { CandidateAccessRateLimitGuard } from "../sessions/access-rate-limit.guard";
import { CandidateAiService } from "./candidate-ai.service";
import { AiService } from "./ai.service";
import type { EvaluationResultDto } from "./evaluation.service";
import {
  AdaptiveAnswerDto,
  AdaptiveQuestionsDto,
  CandidateFollowUpDto,
  CandidateInterviewQuestionDto,
  EvaluateDto,
  FollowUpDto,
  InterviewQuestionDto,
  ReportDto,
} from "./dto/ai.dto";

@Controller("ai")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "organization", "interviewer")
export class AiController {
  constructor(@Inject(AiService) private readonly aiService: AiService) {}

  @Post("interview-question")
  async interviewQuestion(@Body(new ValidateDto(InterviewQuestionDto)) body: InterviewQuestionDto) {
    return this.aiService.generateInterviewQuestion(body);
  }

  @Post("follow-up")
  async followUp(@Body(new ValidateDto(FollowUpDto)) body: FollowUpDto) {
    return this.aiService.generateFollowUp(body);
  }

  @Post("evaluate")
  async evaluate(@Body(new ValidateDto(EvaluateDto)) body: EvaluateDto) {
    return this.aiService.evaluateResponse({
      moduleId: body.moduleId,
      moduleTitle: body.moduleTitle,
      moduleType: body.moduleType ?? "ai_interview",
      responseText: body.responseText ?? "",
      questionContext: body.questionContext,
      rubric: body.rubric,
      weight: body.weight,
    });
  }

  @Post("report")
  async report(@Body(new ValidateDto(ReportDto)) body: ReportDto) {
    return this.aiService.generateCandidateReport({
      sessionId: body.sessionId ?? "demo-session",
      candidateName: body.candidateName ?? "Demo Candidate",
      assessmentName: body.assessmentName ?? "Evalora Assessment",
      completedAt: body.completedAt,
      evaluations: body.evaluations?.length
        ? (body.evaluations as EvaluationResultDto[])
        : [
            await this.aiService.evaluateResponse({
              moduleType: "ai_interview",
              moduleTitle: "AI Interview",
              responseText: "Candidate explained project trade-offs, testing steps, and communication decisions.",
            }),
          ],
      reviewerNotes: body.reviewerNotes,
    });
  }
}

@Controller("ai/access")
@UseGuards(CandidateAccessRateLimitGuard)
export class CandidateAiController {
  constructor(@Inject(CandidateAiService) private readonly candidateAiService: CandidateAiService) {}

  @Get(":accessCode/conversation")
  conversation(@Param("accessCode") accessCode: string) {
    return this.candidateAiService.conversation(accessCode);
  }

  @Post(":accessCode/interview-question")
  interviewQuestion(@Param("accessCode") accessCode: string, @Body(new ValidateDto(CandidateInterviewQuestionDto)) body: CandidateInterviewQuestionDto) {
    return this.candidateAiService.interviewQuestion(accessCode, body);
  }

  @Post(":accessCode/follow-up")
  followUp(@Param("accessCode") accessCode: string, @Body(new ValidateDto(CandidateFollowUpDto)) body: CandidateFollowUpDto) {
    return this.candidateAiService.followUp(accessCode, body);
  }

  @Post(":accessCode/follow-up/stream")
  async followUpStream(
    @Param("accessCode") accessCode: string,
    @Body(new ValidateDto(CandidateFollowUpDto)) body: CandidateFollowUpDto,
    @Res() response: Response,
  ) {
    let streaming = false;
    const openStream = () => {
      if (streaming) return;
      streaming = true;
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      response.setHeader("Cache-Control", "no-cache");
      response.setHeader("Connection", "keep-alive");
      // Nginx buffers proxied responses by default, which would hold every token
      // back until the answer is complete and defeat the whole feature.
      response.setHeader("X-Accel-Buffering", "no");
      response.flushHeaders();
    };

    try {
      // followUpStream only resolves once the question is stored, so the done frame is
      // the commit point: the client may treat the question as answerable only after it.
      const generated = await this.candidateAiService.followUpStream(accessCode, body, {
        onDelta: (delta) => {
          openStream();
          writeStreamFrame(response, { delta });
        },
        // A replace frame is the whole rendered question, not more text: the client
        // must drop what it has shown so far rather than append to a partial question.
        onReplace: (question) => {
          openStream();
          writeStreamFrame(response, { replace: question });
        },
      });
      openStream();
      writeStreamFrame(response, {
        done: true,
        shouldAsk: generated.shouldAsk,
        question: generated.question,
        provider: generated.provider,
      });
      response.end();
    } catch (error) {
      // Nothing written yet means access or validation failed, so the normal HTTP
      // error is still available; after the first frame the stream owns the response.
      if (!streaming) throw error;
      // No done frame was written, so the preview is withdrawn as well. Leaving it on
      // screen would invite an answer to a question the server never stored.
      writeStreamFrame(response, { replace: "", error: streamErrorMessage(error) });
      response.end();
    }
  }

  @Post(":accessCode/adaptive-questions")
  adaptiveQuestions(@Param("accessCode") accessCode: string, @Body(new ValidateDto(AdaptiveQuestionsDto)) body: AdaptiveQuestionsDto) {
    return this.candidateAiService.adaptiveQuestions(accessCode, body.count ?? 3);
  }

  @Get(":accessCode/adaptive-questions")
  existingAdaptiveQuestions(@Param("accessCode") accessCode: string) {
    return this.candidateAiService.existingAdaptiveQuestions(accessCode);
  }

  @Post(":accessCode/adaptive-answer")
  saveAdaptiveAnswer(@Param("accessCode") accessCode: string, @Body(new ValidateDto(AdaptiveAnswerDto)) body: AdaptiveAnswerDto) {
    return this.candidateAiService.saveAdaptiveAnswer(accessCode, body);
  }
}

function writeStreamFrame(response: Response, payload: Record<string, unknown>) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function streamErrorMessage(error: unknown): string {
  // Provider errors can carry the request URL or key material, so only curated
  // exception messages ever reach the candidate.
  if (error instanceof HttpException) return error.message;
  return "The AI assistant is unavailable right now. Please try again.";
}
