import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ValidateDto } from "../../common/pipes/validate-dto.pipe";
import { toAccessContext } from "../auth/access-control";
import { type AuthenticatedRequest, JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import { AddReviewerNoteDto } from "./dto/report.dto";
import { ReportsService } from "./reports.service";

@Controller("reports")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reportsService: ReportsService) {}

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

  @Get(":sessionId/notes")
  @Roles("admin", "organization", "interviewer")
  notes(@Param("sessionId") sessionId: string, @Req() request: AuthenticatedRequest) {
    return this.reportsService.listReviewerNotes(sessionId, toAccessContext(request.user));
  }

  @Post(":sessionId/notes")
  @Roles("admin", "organization", "interviewer")
  async addNote(
    @Param("sessionId") sessionId: string,
    @Body(new ValidateDto(AddReviewerNoteDto)) body: AddReviewerNoteDto,
    @Req() request: AuthenticatedRequest,
  ) {
    try {
      return await this.reportsService.addReviewerNote(sessionId, body.note, toAccessContext(request.user));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unable to add reviewer note.");
    }
  }
}
