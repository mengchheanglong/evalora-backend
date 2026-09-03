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
import { ValidateDto } from "../../common/pipes/validate-dto.pipe";
import { ValidateQuery } from "../../common/validation/pipes/validate-query.pipe";
import { toAccessContext } from "../auth/access-control";
import { type AuthenticatedRequest, JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import {
  CloneFromCatalogDto,
  CreateTemplateDto,
  ListTemplatesQueryDto,
  UpdateTemplateDto,
} from "./dto/template.dto";
import {
  type CreateTemplateInput,
  TemplatesService,
  type UpdateTemplateInput,
} from "./templates.service";

@Controller("templates")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TemplatesController {
  constructor(@Inject(TemplatesService) private readonly templatesService: TemplatesService) {}

  /** Prebuilt library (read-only blueprints). Must be registered before :id routes. */
  @Get("catalog")
  @Roles("admin", "organization", "interviewer")
  listCatalog() {
    return this.templatesService.listCatalog();
  }

  @Get("catalog/:catalogId")
  @Roles("admin", "organization", "interviewer")
  getCatalog(@Param("catalogId") catalogId: string) {
    return this.templatesService.getCatalogTemplate(catalogId);
  }

  /** Clone a prebuilt into the caller's organization (ready to assign or edit). */
  @Post("from-catalog")
  @Roles("admin", "organization", "interviewer")
  async cloneFromCatalog(
    @Body(new ValidateDto(CloneFromCatalogDto)) body: CloneFromCatalogDto,
    @Req() request: AuthenticatedRequest,
  ) {
    try {
      return await this.templatesService.cloneFromCatalog(body, toAccessContext(request.user));
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "Unable to use catalog template.");
    }
  }

  @Get()
  @Roles("admin", "organization", "interviewer")
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query(new ValidateQuery(ListTemplatesQueryDto)) query: ListTemplatesQueryDto,
  ) {
    return this.templatesService.listTemplates({
      organizationId: query.organizationId,
      access: toAccessContext(request.user),
    });
  }

  @Post()
  @Roles("admin", "organization", "interviewer")
  async create(
    @Body(new ValidateDto(CreateTemplateDto)) body: CreateTemplateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    try {
      return await this.templatesService.createTemplate(
        body as unknown as CreateTemplateInput,
        toAccessContext(request.user),
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "Template creation failed.");
    }
  }

  @Post(":id/duplicate")
  @Roles("admin", "organization", "interviewer")
  async duplicate(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    try {
      return await this.templatesService.duplicateTemplate(id, toAccessContext(request.user));
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "Template duplication failed.");
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
  @Roles("admin", "organization", "interviewer")
  async update(
    @Param("id") id: string,
    @Body(new ValidateDto(UpdateTemplateDto)) body: UpdateTemplateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    try {
      return await this.templatesService.updateTemplate(
        id,
        body as unknown as UpdateTemplateInput,
        toAccessContext(request.user),
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "Template update failed.");
    }
  }

  @Delete(":id")
  @Roles("admin", "organization", "interviewer")
  async remove(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    try {
      return await this.templatesService.deleteTemplate(id, toAccessContext(request.user));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "Template delete failed.");
    }
  }
}
