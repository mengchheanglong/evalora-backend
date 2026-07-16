import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import { toAccessContext } from "../auth/access-control";
import { type AuthenticatedRequest, JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import { AnalyticsService } from "./analytics.service";

@Controller("analytics")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analyticsService: AnalyticsService) {}

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

  @Get("module-performance")
  @Roles("admin", "organization", "interviewer")
  modulePerformance(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.modulePerformance(toAccessContext(request.user));
  }

  @Get("score-distribution")
  @Roles("admin", "organization", "interviewer")
  scoreDistribution(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.scoreDistribution(toAccessContext(request.user));
  }

  @Get("trend")
  @Roles("admin", "organization", "interviewer")
  trend(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.trend(toAccessContext(request.user));
  }

  @Get("themes")
  @Roles("admin", "organization", "interviewer")
  themes(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.themes(toAccessContext(request.user));
  }

  @Get("trend")
  @Roles("admin", "organization", "interviewer")
  trend(@Req() request: AuthenticatedRequest) {
    return this.analyticsService.trend(toAccessContext(request.user));
  }
}
