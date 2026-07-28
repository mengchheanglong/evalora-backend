import { BadRequestException, Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { toAccessContext } from "../auth/access-control";
import { type AuthenticatedRequest, JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import { AnalyticsService } from "./analytics.service";
import { SystemHealthService } from "./system-health.service";

@Controller("analytics")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService) private readonly analyticsService: AnalyticsService,
    @Inject(SystemHealthService) private readonly systemHealthService: SystemHealthService,
  ) {}

  /** Operational view: live transport stats, workload, and dependency health. */
  @Get("system-health")
  @Roles("admin", "organization", "interviewer")
  systemHealth(@Req() request: AuthenticatedRequest) {
    return this.systemHealthService.snapshot(toAccessContext(request.user));
  }

  @Get("summary")
  @Roles("admin", "organization", "interviewer")
  summary(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.summary(toAccessContext(request.user));
  }

  @Get("activity")
  @Roles("admin", "organization", "interviewer")
  activity(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.activity(toAccessContext(request.user));
  }

  @Get("ready-reports")
  @Roles("admin", "organization", "interviewer")
  readyReports(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.readyReports(toAccessContext(request.user));
  }

  @Get("module-performance")
  @Roles("admin", "organization", "interviewer")
  modulePerformance(@Req() request: AuthenticatedRequest, @Query("templateId") templateId?: unknown) {
    return this.analyticsService.modulePerformance(toAccessContext(request.user), requireTemplateId(templateId));
  }

  @Get("score-distribution")
  @Roles("admin", "organization", "interviewer")
  scoreDistribution(@Req() request: AuthenticatedRequest, @Query("templateId") templateId?: unknown) {
    return this.analyticsService.scoreDistribution(toAccessContext(request.user), requireTemplateId(templateId));
  }

  @Get("completion-duration")
  @Roles("admin", "organization", "interviewer")
  completionDuration(@Req() request: AuthenticatedRequest, @Query("templateId") templateId?: unknown) {
    return this.analyticsService.completionDuration(toAccessContext(request.user), requireTemplateId(templateId));
  }

  @Get("template-usage")
  @Roles("admin", "organization", "interviewer")
  templateUsage(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.templateUsage(toAccessContext(request.user));
  }

  @Get("trend")
  @Roles("admin", "organization", "interviewer")
  trend(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.trend(toAccessContext(request.user));
  }

  @Get("upcoming")
  @Roles("admin", "organization", "interviewer")
  upcoming(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.upcoming(toAccessContext(request.user));
  }

  @Get("themes")
  @Roles("admin", "organization", "interviewer")
  themes(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.themes(toAccessContext(request.user));
  }
}

function requireTemplateId(templateId?: unknown) {
  const value = typeof templateId === "string" ? templateId.trim() : "";
  if (!value) throw new BadRequestException("templateId is required for comparable analytics");
  return value;
}
