import { Controller, Get, Param, Post } from "@nestjs/common";
import { ReportsService } from "./reports.service";

@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get(":sessionId")
  findOne(@Param("sessionId") sessionId: string) {
    return this.reportsService.buildDemoReport(sessionId).report;
  }

  @Post(":sessionId/generate")
  generate(@Param("sessionId") sessionId: string) {
    return this.reportsService.generateAndPersistDemoReport(sessionId);
  }

  @Get(":sessionId/export")
  exportReport(@Param("sessionId") sessionId: string) {
    return {
      sessionId,
      status: "not_implemented",
      message: "PDF/export support is a future improvement unless prioritized.",
    };
  }
}
