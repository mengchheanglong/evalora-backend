import { Body, Controller, Post } from "@nestjs/common";

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
  evaluate() {
    return {
      score: 4,
      summary: "Demo evaluation. Replace with provider-backed rubric evaluation.",
      strengths: ["Clear explanation", "Practical approach"],
      improvementAreas: ["Add more measurable evidence"],
      evidence: ["Uses a structured answer with action and result."],
      advisoryNotice: "AI feedback is advisory and must be reviewed by a human interviewer.",
    };
  }

  @Post("report")
  report() {
    return {
      summary: "Demo AI report summary. Replace with evidence-based report generator.",
      advisoryNotice: "AI feedback is advisory and not a final hiring decision.",
    };
  }
}
