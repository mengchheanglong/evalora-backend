import { Body, Controller, Post } from "@nestjs/common";
import { evaluateResponse, generateCandidateReport, type EvaluateResponseInput, type EvaluationResultDto } from "./evaluation.service";

@Controller("ai")
export class AiController {
  @Post("interview-question")
  interviewQuestion(@Body() body: { roleType?: string }) {
    return {
      question: `Tell me about a project you built for a ${body.roleType ?? "target"} role and the hardest problem you solved.`,
      rubric: ["clarity", "technical depth", "problem solving", "reflection"],
    };
  }

  @Post("follow-up")
  followUp(@Body() body: { answer?: string }) {
    return {
      question: "What trade-off did you consider, and how did you decide between options?",
      basedOn: body.answer ? "candidate_answer" : "default_follow_up",
    };
  }

  @Post("evaluate")
  evaluate(@Body() body: Partial<EvaluateResponseInput>) {
    return evaluateResponse({
      moduleId: body.moduleId,
      moduleTitle: body.moduleTitle,
      moduleType: body.moduleType ?? "ai_interview",
      responseText: body.responseText ?? "",
      rubric: body.rubric,
      weight: body.weight,
    });
  }

  @Post("report")
  report(
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
    return generateCandidateReport({
      sessionId: body.sessionId ?? "demo-session",
      candidateName: body.candidateName ?? "Demo Candidate",
      assessmentName: body.assessmentName ?? "Evalora Assessment",
      completedAt: body.completedAt,
      evaluations: body.evaluations?.length
        ? body.evaluations
        : [
            evaluateResponse({
              moduleType: "ai_interview",
              moduleTitle: "AI Interview",
              responseText: "Candidate explained project trade-offs, testing steps, and communication decisions.",
            }),
          ],
      reviewerNotes: body.reviewerNotes,
    });
  }
}
