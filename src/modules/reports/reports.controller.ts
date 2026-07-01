import { Controller, Get, Param, Post } from "@nestjs/common";
import { demoReport } from "../mock-data";

@Controller("reports")
export class ReportsController {
  @Get(":sessionId")
  findOne(@Param("sessionId") sessionId: string) {
    return {
      ...demoReport,
      sessionId,
    };
  }

  @Post(":sessionId/generate")
  generate(@Param("sessionId") sessionId: string) {
    return {
      ...demoReport,
      sessionId,
      generatedAt: new Date().toISOString(),
      message: "Report generation scaffold. Add evaluation aggregation and persistence.",
    };
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
