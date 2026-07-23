import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
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
