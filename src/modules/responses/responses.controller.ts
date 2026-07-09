import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { toAccessContext } from "../auth/access-control";
import { type AuthenticatedRequest, JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import { type SaveResponseInput, ResponsesService } from "./responses.service";

@Controller("responses")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResponsesController {
  constructor(private readonly responsesService: ResponsesService) {}

  @Post()
  @Roles("admin", "organization", "interviewer")
  async submit(@Body() body: SaveResponseInput, @Req() request: AuthenticatedRequest) {
    try {
      return await this.responsesService.saveResponse(body, toAccessContext(request.user));
    } catch (error) {
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
export class CandidateResponsesAccessController {
  constructor(private readonly responsesService: ResponsesService) {}

  @Post(":accessCode")
  async submitByAccessCode(@Param("accessCode") accessCode: string, @Body() body: SaveResponseInput) {
    try {
      return await this.responsesService.saveResponseByAccessCode(accessCode, body);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Response save failed.");
    }
  }

  @Get(":accessCode")
  findByAccessCode(@Param("accessCode") accessCode: string) {
    return this.responsesService.listResponsesByAccessCode(accessCode);
  }
}
