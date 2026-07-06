import { Injectable } from "@nestjs/common";
import { evaluateResponse, generateCandidateReport, type EvaluationResultDto, type GeneratedCandidateReport } from "../ai/evaluation.service";

interface ReportPersistenceClient {
  evaluation: {
    deleteMany(args: unknown): Promise<unknown>;
    createMany(args: unknown): Promise<unknown>;
  };
  candidateReport: {
    upsert(args: unknown): Promise<unknown>;
  };
  $transaction<T>(operations: Array<Promise<T>>): Promise<T[]>;
}

export type ReportPersistenceResult =
  | { status: "persisted"; evaluationCount: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

interface PersistReportInput {
  report: GeneratedCandidateReport;
  evaluations: EvaluationResultDto[];
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma?: ReportPersistenceClient) {}

  buildDemoReport(sessionId: string) {
    const evaluations = this.buildDemoEvaluations();
    const report = generateCandidateReport({
      sessionId,
      candidateName: "Demo Candidate",
      assessmentName: "Software Engineer Assessment",
      completedAt: new Date().toISOString(),
      evaluations,
      reviewerNotes: ["Reviewer should validate AI feedback against the original candidate responses."],
    });

    return { report, evaluations };
  }

  async generateAndPersistDemoReport(sessionId: string) {
    const { report, evaluations } = this.buildDemoReport(sessionId);
    const persistence = await this.persistReport({ report, evaluations });

    return {
      ...report,
      generatedAt: new Date().toISOString(),
      persistence,
      message: persistence.status === "persisted" ? "Report generated and persisted." : `Report generated without persistence: ${persistence.reason}.`,
    };
  }

  async persistReport({ report, evaluations }: PersistReportInput): Promise<ReportPersistenceResult> {
    if (!this.prisma) {
      return { status: "skipped", reason: "database client unavailable" };
    }

    try {
      await this.prisma.$transaction([
        this.prisma.evaluation.deleteMany({ where: { sessionId: report.sessionId } }),
        this.prisma.evaluation.createMany({
          data: evaluations.map((evaluation) => ({
            sessionId: report.sessionId,
            moduleId: evaluation.moduleId ?? null,
            score: evaluation.score,
            feedback: evaluation.feedback,
            evidence: evaluation.evidence,
            criteriaScores: evaluation.criteriaScores,
          })),
        }),
        this.prisma.candidateReport.upsert({
          where: { sessionId: report.sessionId },
          create: {
            sessionId: report.sessionId,
            overallScore: report.overallScore,
            moduleScores: report.moduleScores,
            summary: report.summary,
            strengths: report.strengths,
            improvementAreas: report.improvementAreas,
            evidence: report.evidence,
            reviewerSummary: report.reviewerSummary,
          },
          update: {
            overallScore: report.overallScore,
            moduleScores: report.moduleScores,
            summary: report.summary,
            strengths: report.strengths,
            improvementAreas: report.improvementAreas,
            evidence: report.evidence,
            reviewerSummary: report.reviewerSummary,
          },
        }),
      ]);

      return { status: "persisted", evaluationCount: evaluations.length };
    } catch {
      return { status: "failed", reason: "database persistence failed" };
    }
  }

  private buildDemoEvaluations(): EvaluationResultDto[] {
    return [
      evaluateResponse({
        moduleId: "mod-ai-interview",
        moduleTitle: "AI Interview",
        moduleType: "ai_interview",
        responseText: "Candidate explained a project with clear trade-offs, testing steps, and team communication.",
        weight: 1,
      }),
      evaluateResponse({
        moduleId: "mod-coding",
        moduleTitle: "Coding Assessment",
        moduleType: "coding",
        responseText: "Candidate wrote readable code, considered edge cases, and described debugging with tests.",
        weight: 1.5,
      }),
      evaluateResponse({
        moduleId: "mod-work-style",
        moduleTitle: "Work-Style Assessment",
        moduleType: "work_style",
        responseText: "Candidate described listening to the team, owning follow-up actions, and adapting under deadline pressure.",
        weight: 1,
      }),
    ];
  }
}
