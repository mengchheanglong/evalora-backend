import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { SessionStatus } from "../../domain/evalora.types";
import { toAccessContext } from "../auth/access-control";
import { type AuthenticatedRequest, JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import { ReportsService } from "../reports/reports.service";
import { CandidateAccessRateLimitGuard } from "./access-rate-limit.guard";
import { type CreateSessionInput, type ListSessionsFilter, SessionsService } from "./sessions.service";

@Controller("sessions")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionsController {
  constructor(
    @Inject(SessionsService) private readonly sessionsService: SessionsService,
    @Inject(ReportsService) private readonly reportsService: ReportsService,
  ) {}

  @Post()
  @Roles("admin", "organization", "interviewer")
  async create(@Body() body: CreateSessionInput, @Req() request: AuthenticatedRequest) {
    try {
      return await this.sessionsService.createSession(body, toAccessContext(request.user));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Session creation failed.");
    }
  }

  @Get()
  @Roles("admin", "organization", "interviewer")
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query("organizationId") organizationId?: string,
    @Query("candidateId") candidateId?: string,
    @Query("templateId") templateId?: string,
    @Query("status") status?: SessionStatus,
  ) {
    const filter: ListSessionsFilter = { organizationId, candidateId, templateId, status };
    return this.sessionsService.listSessions(filter, toAccessContext(request.user));
  }

  @Get(":id")
  @Roles("admin", "organization", "interviewer")
  async findOne(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    const session = await this.sessionsService.getSession(id, toAccessContext(request.user));
    if (!session) throw new NotFoundException("Session not found.");
    return session;
  }

  @Put(":id/start")
  @Roles("admin", "organization", "interviewer")
  start(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.sessionsService.startSession(id, toAccessContext(request.user));
  }

  @Put(":id/complete")
  @Roles("admin", "organization", "interviewer")
  async complete(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    const access = toAccessContext(request.user);
    const session = await this.sessionsService.completeSession(id, access);
    this.queueReportGeneration(session.id, access);
    return { ...session, reportStatus: session.reportReady ? "generated" as const : "pending" as const };
  }

  private queueReportGeneration(id: string, access: ReturnType<typeof toAccessContext>) {
    void this.reportsService.generateAndPersistReport(id, access).catch(() => undefined);
  }
}

@Controller("sessions/access")
@UseGuards(CandidateAccessRateLimitGuard)
export class CandidateSessionAccessController {
  constructor(
    @Inject(SessionsService) private readonly sessionsService: SessionsService,
    @Inject(ReportsService) private readonly reportsService: ReportsService,
  ) {}

  @Get(":accessCode")
  findByAccessCode(@Param("accessCode") accessCode: string) {
    return this.sessionsService.getSessionByAccessCode(accessCode);
  }

  @Put(":accessCode/start")
  startByAccessCode(@Param("accessCode") accessCode: string) {
    return this.sessionsService.startSessionByAccessCode(accessCode);
  }

  @Put(":accessCode/complete")
  async completeByAccessCode(@Param("accessCode") accessCode: string) {
    const session = await this.sessionsService.completeSessionByAccessCode(accessCode);
    void this.reportsService.generateAndPersistReport(session.id).catch(() => undefined);
    return { ...session, reportStatus: "pending" as const };
  }
}
