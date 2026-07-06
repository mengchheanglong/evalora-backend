import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import { type SaveResponseInput, ResponsesService } from "./responses.service";

@Controller("responses")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResponsesController {
  constructor(private readonly responsesService: ResponsesService) {}

  @Post()
  @Roles("admin", "organization", "interviewer", "candidate")
  async submit(@Body() body: SaveResponseInput) {
    try {
      return await this.responsesService.saveResponse(body);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Response save failed.");
    }
  }

  @Get("session/:sessionId")
  @Roles("admin", "organization", "interviewer", "candidate")
  findBySession(@Param("sessionId") sessionId: string) {
    return this.responsesService.listResponsesBySession(sessionId);
  }
}
