import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
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
<<<<<<< HEAD
import { ValidateDto } from "../../common/pipes/validate-dto.pipe";
=======
import { LiveKitService } from "../livekit/livekit.service";
>>>>>>> ab7764096ed6792c8049b240000bd24492546f59
import { CandidateAccessRateLimitGuard } from "./access-rate-limit.guard";
import { ReportIntegrityEventDto } from "./dto/report-integrity-event.dto";
import { type CreateSessionInput, type ListSessionsFilter, SessionsService } from "./sessions.service";

@Controller("sessions")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionsController {
  constructor(
    @Inject(SessionsService) private readonly sessionsService: SessionsService,
    @Inject(ReportsService) private readonly reportsService: ReportsService,
    @Inject(LiveKitService) private readonly liveKitService: LiveKitService,
  ) {}

  @Post()
  @Roles("admin", "organization", "interviewer")
  async create(@Body() body: CreateSessionInput, @Req() request: AuthenticatedRequest) {
    try {
      return await this.sessionsService.createSession(body, toAccessContext(request.user));
    } catch (error) {
      if (error instanceof HttpException) throw error;
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

<<<<<<< HEAD
  @Get(":id/integrity-events")
  @Roles("admin", "organization", "interviewer")
  getIntegrityEvents(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.sessionsService.getIntegrityEvents(id, toAccessContext(request.user));
=======
  @Post(":id/livekit-token")
  @Roles("admin", "organization", "interviewer")
  async liveKitToken(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    const session = await this.sessionsService.getSession(id, toAccessContext(request.user));
    if (!session || !request.user) throw new NotFoundException("Session not found.");
    return this.liveKitService.createParticipantToken({
      sessionId: session.id,
      identity: `interviewer:${request.user.id}`,
      name: request.user.email,
      role: "interviewer",
    });
>>>>>>> ab7764096ed6792c8049b240000bd24492546f59
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

  @Delete(":id")
  @Roles("admin", "organization", "interviewer")
  async remove(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    await this.sessionsService.deleteSession(id, toAccessContext(request.user));
    return { id, deleted: true };
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
    @Inject(LiveKitService) private readonly liveKitService: LiveKitService,
  ) {}

  @Get(":accessCode")
  findByAccessCode(@Param("accessCode") accessCode: string) {
    return this.sessionsService.getSessionByAccessCode(accessCode);
  }

  /** Device check runs before session start; a valid open invite is sufficient. */
  @Post(":accessCode/livekit-token")
  async liveKitToken(@Param("accessCode") accessCode: string) {
    const session = await this.sessionsService.getSessionByAccessCode(accessCode);
    return this.liveKitService.createParticipantToken({
      sessionId: session.id,
      identity: `candidate:${session.candidateId ?? session.id}`,
      name: session.candidateName,
      role: "candidate",
    });
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

  @Put(":accessCode/timeout")
  timeoutByAccessCode(@Param("accessCode") accessCode: string) {
    return this.sessionsService.expireSessionByAccessCode(accessCode);
  }

  @Post(":accessCode/integrity-events")
  async recordIntegrityEvent(
    @Param("accessCode") accessCode: string,
    @Body(new ValidateDto(ReportIntegrityEventDto)) body: ReportIntegrityEventDto,
  ) {
    try {
      return await this.sessionsService.recordIntegrityEvent(accessCode, body);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "Integrity event could not be recorded.");
    }
  }
}
