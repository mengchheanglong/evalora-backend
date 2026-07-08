import { Body, Controller, Post } from "@nestjs/common";
import { AiService, type FollowUpInput, type InterviewQuestionInput } from "./ai.service";
import type { EvaluateResponseInput, EvaluationResultDto } from "./evaluation.service";

@Controller("ai")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("interview-question")
  async interviewQuestion(@Body() body: InterviewQuestionInput) {
    return this.aiService.generateInterviewQuestion(body);
  }

  @Post("follow-up")
  async followUp(@Body() body: FollowUpInput) {
    return this.aiService.generateFollowUp(body);
  }

  @Post("evaluate")
  async evaluate(@Body() body: Partial<EvaluateResponseInput>) {
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
  async report(
    @Body()
    body: {
      sessionId?: string;
      candidateName?: string;
      assessmentName?: string;
      completedAt?: string;
      evaluations?: EvaluationResultDto[];
      reviewerNotes?: string[];
    },
  ) {
    return this.aiService.generateCandidateReport({
      sessionId: body.sessionId ?? "demo-session",
      candidateName: body.candidateName ?? "Demo Candidate",
      assessmentName: body.assessmentName ?? "Evalora Assessment",
      completedAt: body.completedAt,
      evaluations: body.evaluations?.length
        ? body.evaluations
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
