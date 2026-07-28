import { Controller, Get, Inject, Param, Req, UseGuards } from "@nestjs/common";
import { toAccessContext } from "../auth/access-control";
import { type AuthenticatedRequest, JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import { TranscriptService } from "./transcript.service";

/**
 * Reviewer-only surface. Shares the `sessions` prefix with the sessions
 * controller; the two-segment route never collides with its `:id` lookup.
 */
@Controller("sessions")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TranscriptController {
  constructor(@Inject(TranscriptService) private readonly service: TranscriptService) {}

  @Get(":sessionId/transcript")
  @Roles("admin", "organization", "interviewer")
  getTranscript(@Param("sessionId") sessionId: string, @Req() request: AuthenticatedRequest) {
    return this.service.getTranscript(sessionId, toAccessContext(request.user));
  }
}
