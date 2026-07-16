import { BadRequestException, Body, Controller, Get, HttpException, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { toAccessContext } from "../auth/access-control";
import { type AuthenticatedRequest, JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import { type SaveResponseInput, ResponsesService } from "./responses.service";
import { CandidateAccessRateLimitGuard } from "../sessions/access-rate-limit.guard";

@Controller("responses")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResponsesController {
  constructor(@Inject(ResponsesService) private readonly responsesService: ResponsesService) {}

  @Post()
  @Roles("admin", "organization", "interviewer")
  async submit(@Body() body: SaveResponseInput, @Req() request: AuthenticatedRequest) {
    try {
      return await this.responsesService.saveResponse(body, toAccessContext(request.user));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "Response save failed.");
    }
  }

  @Get("session/:sessionId")
  @Roles("admin", "organization", "interviewer")
  findBySession(@Param("sessionId") sessionId: string, @Req() request: AuthenticatedRequest) {
    return this.responsesService.listResponsesBySession(sessionId, toAccessContext(request.user));
  }
}

@Controller("responses/access")
@UseGuards(CandidateAccessRateLimitGuard)
export class CandidateResponsesAccessController {
  constructor(@Inject(ResponsesService) private readonly responsesService: ResponsesService) {}

  @Post(":accessCode")
  async submitByAccessCode(@Param("accessCode") accessCode: string, @Body() body: SaveResponseInput) {
    try {
      return await this.responsesService.saveResponseByAccessCode(accessCode, body);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "Response save failed.");
    }
  }

  @Get(":accessCode")
  findByAccessCode(@Param("accessCode") accessCode: string) {
    return this.responsesService.listResponsesByAccessCode(accessCode);
  }
}
