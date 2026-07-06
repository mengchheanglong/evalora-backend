import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { toAccessContext } from "../auth/access-control";
import { type AuthenticatedRequest, JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import { type CreateTemplateInput, TemplatesService, type UpdateTemplateInput } from "./templates.service";

@Controller("templates")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  @Roles("admin", "organization", "interviewer")
  findAll(@Req() request: AuthenticatedRequest, @Query("organizationId") organizationId?: string) {
    return this.templatesService.listTemplates({ organizationId, access: toAccessContext(request.user) });
  }

  @Post()
  @Roles("admin", "organization")
  async create(@Body() body: CreateTemplateInput, @Req() request: AuthenticatedRequest) {
    try {
      return await this.templatesService.createTemplate(body, toAccessContext(request.user));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Template creation failed.");
    }
  }

  @Get(":id")
  @Roles("admin", "organization", "interviewer")
  async findOne(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    const template = await this.templatesService.getTemplate(id, toAccessContext(request.user));
    if (!template) throw new NotFoundException("Template not found.");
    return template;
  }

  @Put(":id")
  @Roles("admin", "organization")
  async update(@Param("id") id: string, @Body() body: UpdateTemplateInput, @Req() request: AuthenticatedRequest) {
    try {
      return await this.templatesService.updateTemplate(id, body, toAccessContext(request.user));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Template update failed.");
    }
  }

  @Delete(":id")
  @Roles("admin", "organization")
  remove(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.templatesService.deleteTemplate(id, toAccessContext(request.user));
  }
}
