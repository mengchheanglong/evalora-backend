import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { SessionStatus } from "../../domain/evalora.types";
import { JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import { type CreateSessionInput, type ListSessionsFilter, SessionsService } from "./sessions.service";

@Controller("sessions")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @Roles("admin", "organization", "interviewer")
  async create(@Body() body: CreateSessionInput) {
    try {
      return await this.sessionsService.createSession(body);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Session creation failed.");
    }
  }

  @Get()
  @Roles("admin", "organization", "interviewer")
  findAll(
    @Query("organizationId") organizationId?: string,
    @Query("candidateId") candidateId?: string,
    @Query("templateId") templateId?: string,
    @Query("status") status?: SessionStatus,
  ) {
    const filter: ListSessionsFilter = { organizationId, candidateId, templateId, status };
    return this.sessionsService.listSessions(filter);
  }

  @Get(":id")
  @Roles("admin", "organization", "interviewer", "candidate")
  async findOne(@Param("id") id: string) {
    const session = await this.sessionsService.getSession(id);
    if (!session) throw new NotFoundException("Session not found.");
    return session;
  }

  @Put(":id/start")
  @Roles("admin", "organization", "interviewer", "candidate")
  start(@Param("id") id: string) {
    return this.sessionsService.startSession(id);
  }

  @Put(":id/complete")
  @Roles("admin", "organization", "interviewer", "candidate")
  complete(@Param("id") id: string) {
    return this.sessionsService.completeSession(id);
  }
}
