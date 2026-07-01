import { Controller, Get } from "@nestjs/common";

@Controller("analytics")
export class AnalyticsController {
  @Get("summary")
  summary() {
    return {
      totalCandidates: 42,
      completedAssessments: 28,
      pendingAssessments: 14,
      averageScore: 4.1,
      completionRate: 0.67,
      modulePerformance: [
        { module: "Technical", average: 4.2 },
        { module: "Communication", average: 4.0 },
        { module: "Leadership", average: 3.8 },
        { module: "Work Style", average: 4.1 },
      ],
    };
  }

  @Get("activity")
  activity() {
    return [
      { type: "session_completed", message: "Demo candidate completed assessment", createdAt: new Date().toISOString() },
      { type: "report_generated", message: "Candidate report generated", createdAt: new Date().toISOString() },
    ];
  }
}
