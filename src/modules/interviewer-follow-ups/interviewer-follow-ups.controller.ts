import { Body, Controller, Get, Inject, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { ValidateDto } from "../../common/pipes/validate-dto.pipe";
import { toAccessContext } from "../auth/access-control";
import { type AuthenticatedRequest, JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import { CandidateAccessRateLimitGuard } from "../sessions/access-rate-limit.guard";
import { AnswerInterviewerFollowUpDto, SendInterviewerFollowUpDto } from "./dto/interviewer-follow-up.dto";
import { InterviewerFollowUpsService } from "./interviewer-follow-ups.service";

@Controller("interviewer-follow-ups")
@UseGuards(JwtAuthGuard, RolesGuard)
export class InterviewerFollowUpsController {
  constructor(@Inject(InterviewerFollowUpsService) private readonly service: InterviewerFollowUpsService) {}

  @Get("session/:sessionId")
  @Roles("admin", "organization", "interviewer")
  list(@Param("sessionId") sessionId: string, @Req() request: AuthenticatedRequest) {
    return this.service.listForSession(sessionId, toAccessContext(request.user));
  }

  @Post("session/:sessionId")
  @Roles("admin", "organization", "interviewer")
  send(
    @Param("sessionId") sessionId: string,
    @Body(new ValidateDto(SendInterviewerFollowUpDto)) body: SendInterviewerFollowUpDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.send(sessionId, body, toAccessContext(request.user));
  }

  @Post("session/:sessionId/:followUpId/cancel")
  @Roles("admin", "organization", "interviewer")
  cancel(
    @Param("sessionId") sessionId: string,
    @Param("followUpId") followUpId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.cancel(sessionId, followUpId, toAccessContext(request.user));
  }
}

/**
 * Candidate surface. No JWT: the private access code is the credential, and the
 * rate-limit guard matches the other candidate controllers.
 */
@Controller("interviewer-follow-ups/access")
@UseGuards(CandidateAccessRateLimitGuard)
export class CandidateInterviewerFollowUpsController {
  constructor(@Inject(InterviewerFollowUpsService) private readonly service: InterviewerFollowUpsService) {}

  @Get(":accessCode")
  list(@Param("accessCode") accessCode: string) {
    return this.service.listByAccessCode(accessCode);
  }

  @Put(":accessCode/:followUpId/answer")
  answer(
    @Param("accessCode") accessCode: string,
    @Param("followUpId") followUpId: string,
    @Body(new ValidateDto(AnswerInterviewerFollowUpDto)) body: AnswerInterviewerFollowUpDto,
  ) {
    return this.service.answerByAccessCode(accessCode, followUpId, body);
  }
}
