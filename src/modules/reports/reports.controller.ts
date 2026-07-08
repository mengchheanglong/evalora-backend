import { Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { toAccessContext } from "../auth/access-control";
import { type AuthenticatedRequest, JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import { ReportsService } from "./reports.service";

@Controller("reports")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get(":sessionId")
  @Roles("admin", "organization", "interviewer")
  findOne(@Param("sessionId") sessionId: string, @Req() request: AuthenticatedRequest) {
    return this.reportsService.getReport(sessionId, toAccessContext(request.user));
  }

  @Post(":sessionId/generate")
  @Roles("admin", "organization", "interviewer")
  generate(@Param("sessionId") sessionId: string, @Req() request: AuthenticatedRequest) {
    return this.reportsService.generateAndPersistReport(sessionId, toAccessContext(request.user));
  }

  @Get(":sessionId/export")
  @Roles("admin", "organization", "interviewer")
  exportReport(@Param("sessionId") sessionId: string, @Req() request: AuthenticatedRequest) {
    return this.reportsService.exportReport(sessionId, toAccessContext(request.user));
  }
}
