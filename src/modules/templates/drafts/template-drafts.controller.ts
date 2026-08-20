import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ValidateDto } from "../../../common/pipes/validate-dto.pipe";
import { toAccessContext } from "../../auth/access-control";
import { type AuthenticatedRequest, JwtAuthGuard, Roles, RolesGuard } from "../../auth/auth.guard";
import { MAX_UPLOAD_BYTES } from "./draft.constants";
import { DocumentExtractionService, type UploadedDocument } from "./document-extraction.service";
import { DraftChatRateLimitGuard, DraftRateLimitGuard } from "./draft-rate-limit.guard";
import {
  ChatTemplateDraftDto,
  ConfirmTemplateDraftDto,
  GenerateTemplateDraftDto,
  UpdateTemplateDraftDto,
} from "./dto/template-draft.dto";
import { TemplateDraftsService } from "./template-drafts.service";

/**
 * AI-assisted template generation.
 *
 * Every route here operates on drafts. None of them creates an assessment except
 * `confirm`, which is the deliberate, authenticated step a human has to take.
 *
 * Route order note: this controller must be registered before TemplatesController
 * in app.module.ts, or `GET /templates/:id` will swallow `/templates/drafts`.
 */
@Controller("templates/drafts")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "organization", "interviewer")
export class TemplateDraftsController {
  constructor(
    @Inject(TemplateDraftsService) private readonly draftsService: TemplateDraftsService,
    @Inject(DocumentExtractionService) private readonly extraction: DocumentExtractionService,
  ) {}

  /**
   * Generate a draft from an uploaded job description or a written idea.
   *
   * Accepts multipart/form-data with a `document` file, or plain JSON when the
   * user typed their idea instead. The multer limit is the first line of defence:
   * an oversized upload is refused before any parsing or model call happens.
   */
  @Post()
  @UseGuards(DraftRateLimitGuard)
  @UseInterceptors(
    FileInterceptor("document", {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async generate(
    @Body(new ValidateDto(GenerateTemplateDraftDto)) body: GenerateTemplateDraftDto,
    @Req() request: AuthenticatedRequest,
    @UploadedFile() document?: UploadedDocument,
  ) {
    const access = toAccessContext(request.user);
    const extracted = document?.buffer?.length ? await this.extraction.extract(document) : undefined;

    try {
      const draft = await this.draftsService.generateDraft(
        {
          idea: body.idea,
          roleType: body.roleType,
          sourceText: extracted?.text,
          sourceFileName: extracted?.fileName,
        },
        access,
      );

      if (extracted?.truncated) {
        draft.draft.warnings.push("The document was long, so only the first part of it was used.");
      }
      return draft;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "Draft generation failed.");
    }
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.draftsService.listDrafts(toAccessContext(request.user));
  }

  @Get(":id")
  findOne(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.draftsService.getDraft(id, toAccessContext(request.user));
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body(new ValidateDto(UpdateTemplateDraftDto)) body: UpdateTemplateDraftDto,
    @Req() request: AuthenticatedRequest,
  ) {
    try {
      return await this.draftsService.updateDraft(id, body, toAccessContext(request.user));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "Draft update failed.");
    }
  }

  /**
   * Conversational refinement: apply one chat instruction to the stored draft.
   * Still draft-only — whatever the assistant does here, nothing reaches a real
   * template except through `confirm` below.
   */
  @Post(":id/chat")
  @UseGuards(DraftChatRateLimitGuard)
  async chat(
    @Param("id") id: string,
    @Body(new ValidateDto(ChatTemplateDraftDto)) body: ChatTemplateDraftDto,
    @Req() request: AuthenticatedRequest,
  ) {
    try {
      return await this.draftsService.refineDraft(id, body, toAccessContext(request.user));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "The assistant could not process that request.");
    }
  }

  /** The one route that turns a proposal into a real, assignable template. */
  @Post(":id/confirm")
  async confirm(
    @Param("id") id: string,
    @Body(new ValidateDto(ConfirmTemplateDraftDto)) body: ConfirmTemplateDraftDto,
    @Req() request: AuthenticatedRequest,
  ) {
    try {
      return await this.draftsService.confirmDraft(id, body, toAccessContext(request.user));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "Publishing this draft failed.");
    }
  }

  @Delete(":id")
  async discard(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    try {
      return await this.draftsService.discardDraft(id, toAccessContext(request.user));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "Discarding this draft failed.");
    }
  }
}
