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
  Patch,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { SessionStatus } from "../../domain/evalora.types";
import { toAccessContext } from "../auth/access-control";
import { type AuthenticatedRequest, JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import { ReportsService } from "../reports/reports.service";
import { LiveKitService } from "../livekit/livekit.service";
import { ValidateDto } from "../../common/pipes/validate-dto.pipe";
import { CandidateAccessRateLimitGuard } from "./access-rate-limit.guard";
import { ReportIntegrityEventDto } from "./dto/report-integrity-event.dto";
import { UpdateIntegrityPolicyDto } from "./dto/update-integrity-policy.dto";
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
      console.error("[sessions.controller] create error:", error);
      if (error instanceof HttpException) throw error;
      // Convert Prisma/unknown errors to a safe user-facing message instead of
      // leaking raw database details that the allowlist cannot possibly cover.
      const message = humanizeSessionError(error);
      throw new BadRequestException(message);
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
  }

  @Get(":id/integrity-events")
  @Roles("admin", "organization", "interviewer")
  getIntegrityEvents(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.sessionsService.getIntegrityEvents(id, toAccessContext(request.user));
  }

  @Patch(":id/integrity-policy")
  @Roles("admin", "organization", "interviewer")
  updateIntegrityPolicy(
    @Param("id") id: string,
    @Body(new ValidateDto(UpdateIntegrityPolicyDto)) body: UpdateIntegrityPolicyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.sessionsService.updateIntegrityPolicy(id, body.detectionEnabled, toAccessContext(request.user));
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

/**
 * Turn raw Prisma / unknown errors into a single safe string the frontend can
 * show to the user.  Never leak database internals — map to a generic
 * message that is already in the PUBLIC_API_MESSAGES allowlist.
 */
function humanizeSessionError(error: unknown): string {
  if (!(error instanceof Error)) return "Session creation failed.";

  // Prisma foreign-key violation (P2003) — candidate or template missing.
  const code = (error as { code?: string }).code;
  if (code === "P2003") {
    const field = (error as { meta?: { field_name?: string } }).meta?.field_name ?? "";
    if (field.includes("candidate")) return "Candidate not found.";
    if (field.includes("template")) return "Template not found.";
    return "The request references data that no longer exists. Please reload and try again.";
  }

  // Prisma unique-constraint violation (P2002).
  if (code === "P2002") return "A session with the same identifier already exists. Please try again.";

  // Prisma record-not-found (P2025).
  if (code === "P2025") return "The request references data that no longer exists. Please reload and try again.";

  // Any other Prisma driver error — map to a safe message.
  if (code && typeof code === "string" && code.startsWith("P")) {
    return "Session creation failed. Please try again.";
  }

  // Known application errors that are NOT in the PUBLIC_API_MESSAGES allowlist
  // should be mapped to a safe generic fallback.
  return error.message || "Session creation failed.";
}
