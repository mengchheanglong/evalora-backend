import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { AssessmentTemplateDto, JsonValue } from "../../../domain/evalora.types";
import { DEFAULT_LIST_LIMIT } from "../../../common/query.constants";
import type { AiService } from "../../ai/ai.service";
import {
  assertCanWriteOrganizationResource,
  forbiddenResourceError,
  requireOrganizationId,
  type AccessContext,
} from "../../auth/access-control";
import type { TemplateModuleInput, TemplateQuestionInput, TemplatesService } from "../templates.service";
import { normalizeDraft } from "./draft-normalizer";
import { buildFallbackProposal } from "./fallback-draft";
import { MAX_CHAT_HISTORY_TURNS, MAX_CHAT_MESSAGE_LENGTH, MAX_CHAT_REPLY_LENGTH, MAX_IDEA_LENGTH } from "./draft.constants";
import type {
  TemplateDraft,
  TemplateDraftChatTurn,
  TemplateDraftDto,
  TemplateDraftGenerationInput,
  TemplateDraftProvider,
  TemplateDraftSource,
  TemplateDraftStatus,
  TemplateDraftSummaryDto,
} from "./template-draft.types";

type PrismaDraftStatus = "DRAFT" | "PUBLISHED" | "DISCARDED";
type PrismaDraftSource = "DOCUMENT" | "PROMPT";

interface DraftRow {
  id: string;
  organizationId: string;
  createdById: string;
  status: PrismaDraftStatus;
  source: PrismaDraftSource;
  sourceFileName?: string | null;
  sourceText?: string | null;
  aiProposal: JsonValue;
  draft: JsonValue;
  provider: string;
  publishedTemplateId?: string | null;
  publishedAt?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

interface DraftPrismaClient {
  assessmentTemplateDraft: {
    create?: (args: any) => Promise<DraftRow>;
    findMany?: (args: any) => Promise<DraftRow[]>;
    findFirst?: (args: any) => Promise<DraftRow | null>;
    update?: (args: any) => Promise<DraftRow>;
  };
}

export interface GenerateDraftInput {
  idea?: string;
  roleType?: string;
  /** Text already extracted from an upload; absent for prompt-only drafts. */
  sourceText?: string;
  sourceFileName?: string;
}

export interface ConfirmDraftInput {
  /** Optional title override applied at publish time. */
  title?: string;
}

export interface RefineDraftInput {
  message?: string;
  /** Prior turns the client replays for context; the server stores none of them. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface DraftChatResultDto {
  /** False when the assistant answered without changing the draft. */
  applied: boolean;
  reply: string;
  draft: TemplateDraftDto;
}

@Injectable()
export class TemplateDraftsService {
  constructor(
    private readonly prisma: DraftPrismaClient,
    private readonly aiService: Pick<AiService, "generateTemplateDraft" | "refineTemplateDraft">,
    private readonly templatesService: Pick<TemplatesService, "createTemplate">,
  ) {}

  /**
   * Produce a draft and store it. This is the only thing generation ever writes:
   * no template, no module, no question row is created here, so an AI proposal
   * cannot reach a candidate without passing through `confirmDraft`.
   */
  async generateDraft(input: GenerateDraftInput, access?: AccessContext): Promise<TemplateDraftDto> {
    assertCanWriteOrganizationResource(access);
    const context = requireAccess(access);
    const organizationId = requireOrganizationId(context);

    const idea = input.idea?.trim().slice(0, MAX_IDEA_LENGTH);
    const sourceText = input.sourceText?.trim();
    if (!idea && !sourceText) {
      throw new BadRequestException("Upload a job description or describe the role you are hiring for.");
    }

    const generationInput: TemplateDraftGenerationInput = { idea, sourceText, roleType: input.roleType?.trim() };
    const { proposal, provider } = await this.aiService.generateTemplateDraft(generationInput);
    const raw = proposal ?? buildFallbackProposal(generationInput);
    const draft = normalizeDraft(raw, { roleType: generationInput.roleType });

    if (provider === "fallback") {
      draft.warnings.unshift(
        "The AI assistant was unavailable, so this draft started from Evalora's closest researched blueprint. Review it carefully before publishing.",
      );
    }
    assertUsableDraft(draft);

    const create = requireMethod(this.prisma.assessmentTemplateDraft.create, "assessmentTemplateDraft.create");
    const row = await create({
      data: {
        organizationId,
        createdById: context.userId,
        status: "DRAFT",
        source: sourceText ? "DOCUMENT" : "PROMPT",
        sourceFileName: input.sourceFileName,
        sourceText,
        aiProposal: draft as unknown as JsonValue,
        draft: draft as unknown as JsonValue,
        provider,
      },
    });

    return toDraftDto(row);
  }

  /**
   * Apply one chat instruction to the stored draft.
   *
   * The revision goes through the same normalizer as generation and hand edits,
   * and only the stored draft ever changes — a chat message cannot publish
   * anything, so confirmDraft stays the single gate to a real template. Failure
   * modes answer conversationally (applied: false plus the unchanged draft)
   * rather than with an error, because "the assistant couldn't do that" is a
   * normal chat outcome, not an exceptional one.
   */
  async refineDraft(id: string, input: RefineDraftInput, access?: AccessContext): Promise<DraftChatResultDto> {
    assertCanWriteOrganizationResource(access);
    const existing = await this.requireDraft(id, access);
    assertEditable(existing);

    const message = input.message?.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
    if (!message) throw new BadRequestException("Describe the change you would like the assistant to make.");

    const current = asDraft(existing.draft);
    const refinement = await this.aiService.refineTemplateDraft({
      currentDraft: current,
      message,
      history: sanitizeChatHistory(input.history),
      // The original upload, so "summarize the document" can go back to the
      // source instead of working from whatever survived into the draft.
      sourceText: existing.sourceText ?? undefined,
    });

    if (refinement.provider === "fallback") {
      return {
        applied: false,
        reply: "The AI assistant is unavailable right now, so nothing was changed. Try again in a moment, or edit the draft directly.",
        draft: toDraftDto(existing),
      };
    }

    if (!refinement.proposal || refinement.changed === false) {
      return {
        applied: false,
        reply:
          clampReply(refinement.reply) ??
          "I didn't change the draft for that request. Tell me what you would like different about this assessment.",
        draft: toDraftDto(existing),
      };
    }

    const draft = normalizeDraft(refinement.proposal, { roleType: current.roleType });
    if (draft.modules.length === 0) {
      return {
        applied: false,
        reply: "That change would leave the assessment without any modules, so nothing was changed. Try describing it differently.",
        draft: toDraftDto(existing),
      };
    }

    const update = requireMethod(this.prisma.assessmentTemplateDraft.update, "assessmentTemplateDraft.update");
    const row = await update({ where: { id: existing.id }, data: { draft: draft as unknown as JsonValue } });

    return {
      applied: true,
      reply: clampReply(refinement.reply) ?? "Done — I've updated the draft.",
      draft: toDraftDto(row),
    };
  }

  async listDrafts(access?: AccessContext): Promise<TemplateDraftSummaryDto[]> {
    const findMany = requireMethod(this.prisma.assessmentTemplateDraft.findMany, "assessmentTemplateDraft.findMany");
    const rows = await findMany({
      where: buildDraftOwnershipWhere(access),
      orderBy: { updatedAt: "desc" },
      take: DEFAULT_LIST_LIMIT,
    });
    return rows.map(toDraftSummaryDto);
  }

  async getDraft(id: string, access?: AccessContext): Promise<TemplateDraftDto> {
    return toDraftDto(await this.requireDraft(id, access));
  }

  /**
   * Replace the editable draft with the reviewer's version. The payload goes
   * through the same normalizer the AI proposal did, so a hand-edited draft
   * cannot carry a shape — or a weight total — that a generated one could not.
   */
  async updateDraft(id: string, draftInput: unknown, access?: AccessContext): Promise<TemplateDraftDto> {
    assertCanWriteOrganizationResource(access);
    const existing = await this.requireDraft(id, access);
    assertEditable(existing);

    const current = asDraft(existing.draft);
    const draft = normalizeDraft(draftInput, { roleType: current.roleType });
    assertUsableDraft(draft);

    const update = requireMethod(this.prisma.assessmentTemplateDraft.update, "assessmentTemplateDraft.update");
    const row = await update({
      where: { id: existing.id },
      data: { draft: draft as unknown as JsonValue },
    });

    return toDraftDto(row);
  }

  /**
   * The confirmation gate: the single path from a draft to a real template.
   *
   * The stored draft is used, never the AI proposal, so what publishes is exactly
   * what the reviewer last saw. Creation is delegated to TemplatesService so org
   * scoping and the AI-interview write rule apply identically to generated and
   * hand-authored templates.
   */
  async confirmDraft(id: string, input: ConfirmDraftInput, access?: AccessContext): Promise<AssessmentTemplateDto> {
    assertCanWriteOrganizationResource(access);
    const existing = await this.requireDraft(id, access);
    assertEditable(existing);

    const draft = normalizeDraft(existing.draft, {});
    assertUsableDraft(draft);

    const template = await this.templatesService.createTemplate(
      {
        title: input.title?.trim() || draft.title,
        description: draft.description,
        roleType: draft.roleType,
        timeLimitMin: draft.timeLimitMin,
        scoringRules: {
          scale: "1-5",
          source: "ai-assisted-draft",
          generatedFromDraftId: existing.id,
          generatedBy: existing.provider,
          advisoryOnly: true,
          weightBasis: draft.modules.map((module) => ({
            title: module.title,
            type: module.type,
            weight: module.weight,
            rationale: module.weightRationale,
            signals: module.weightSignals,
          })),
        },
        modules: draft.modules.map(toModuleInput),
      },
      access,
    );

    const update = requireMethod(this.prisma.assessmentTemplateDraft.update, "assessmentTemplateDraft.update");
    await update({
      where: { id: existing.id },
      data: { status: "PUBLISHED", publishedTemplateId: template.id, publishedAt: new Date() },
    });

    return template;
  }

  async discardDraft(id: string, access?: AccessContext): Promise<{ id: string; status: TemplateDraftStatus }> {
    assertCanWriteOrganizationResource(access);
    const existing = await this.requireDraft(id, access);
    // A published draft is a record of what was published; discarding it would
    // erase the provenance the template's scoringRules point at.
    if (existing.status === "PUBLISHED") {
      throw new ConflictException("This draft was already published and cannot be discarded.");
    }

    const update = requireMethod(this.prisma.assessmentTemplateDraft.update, "assessmentTemplateDraft.update");
    const row = await update({ where: { id: existing.id }, data: { status: "DISCARDED" } });
    return { id: row.id, status: fromPrismaStatus(row.status) };
  }

  private async requireDraft(id: string, access?: AccessContext): Promise<DraftRow> {
    const findFirst = requireMethod(this.prisma.assessmentTemplateDraft.findFirst, "assessmentTemplateDraft.findFirst");
    const row = await findFirst({ where: { id, ...buildDraftOwnershipWhere(access) } });
    if (!row) throw forbiddenResourceError("Template draft");
    return row;
  }
}

/**
 * Drafts hold uploaded document text, so they are strictly organization-scoped.
 * Unlike templates there is no catalog tier and no cross-org read: only a platform
 * admin sees beyond one workspace.
 */
function buildDraftOwnershipWhere(access?: AccessContext): Record<string, unknown> {
  if (!access || access.role === "admin") return {};
  if (access.role === "organization" || access.role === "interviewer") {
    return { organizationId: requireOrganizationId(access) };
  }
  throw forbiddenResourceError("Template draft");
}

function assertEditable(row: DraftRow): void {
  if (row.status === "PUBLISHED") {
    throw new ConflictException("This draft was already published. Duplicate the template instead of publishing again.");
  }
  if (row.status === "DISCARDED") {
    throw new ConflictException("This draft was discarded and can no longer be edited.");
  }
}

/** Drops malformed turns rather than rejecting: history is context, not content. */
function sanitizeChatHistory(history: RefineDraftInput["history"]): TemplateDraftChatTurn[] | undefined {
  if (!history?.length) return undefined;
  const turns = history
    .filter(
      (turn): turn is { role: "user" | "assistant"; content: string } =>
        (turn?.role === "user" || turn?.role === "assistant") && typeof turn?.content === "string" && Boolean(turn.content.trim()),
    )
    .map((turn) => ({ role: turn.role, content: turn.content.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH) }));
  return turns.length ? turns.slice(-MAX_CHAT_HISTORY_TURNS) : undefined;
}

function clampReply(reply: string | undefined): string | undefined {
  const trimmed = reply?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_CHAT_REPLY_LENGTH ? `${trimmed.slice(0, MAX_CHAT_REPLY_LENGTH - 1)}…` : trimmed;
}

function assertUsableDraft(draft: TemplateDraft): void {
  if (draft.modules.length === 0) {
    throw new BadRequestException("A draft needs at least one module. Add a module, or generate the draft again.");
  }
}

function toModuleInput(module: TemplateDraft["modules"][number]): TemplateModuleInput {
  return {
    type: module.type,
    title: module.title,
    description: module.description || undefined,
    weight: module.weight,
    orderIndex: module.orderIndex,
    settings: module.settings,
    questions: module.questions.map(toQuestionInput),
  };
}

function toQuestionInput(question: TemplateDraft["modules"][number]["questions"][number]): TemplateQuestionInput {
  return {
    questionText: question.questionText,
    questionType: question.questionType,
    options: question.options?.length ? question.options : undefined,
    rubric: question.rubric,
  };
}

function toDraftDto(row: DraftRow): TemplateDraftDto {
  return {
    id: row.id,
    status: fromPrismaStatus(row.status),
    source: fromPrismaSource(row.source),
    sourceFileName: row.sourceFileName ?? undefined,
    provider: toProvider(row.provider),
    draft: asDraft(row.draft),
    aiProposal: asDraft(row.aiProposal),
    publishedTemplateId: row.publishedTemplateId ?? undefined,
    publishedAt: toIsoString(row.publishedAt),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toDraftSummaryDto(row: DraftRow): TemplateDraftSummaryDto {
  const draft = asDraft(row.draft);
  return {
    id: row.id,
    status: fromPrismaStatus(row.status),
    source: fromPrismaSource(row.source),
    sourceFileName: row.sourceFileName ?? undefined,
    provider: toProvider(row.provider),
    title: draft.title,
    roleType: draft.roleType,
    moduleCount: draft.modules.length,
    questionCount: draft.modules.reduce((total, module) => total + module.questions.length, 0),
    publishedTemplateId: row.publishedTemplateId ?? undefined,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

/** Stored JSON is re-normalized on read: a row written before a rule changed, or
 *  edited outside the API, still comes back satisfying today's invariants. */
function asDraft(value: JsonValue): TemplateDraft {
  return normalizeDraft(value, {});
}

function fromPrismaStatus(status: PrismaDraftStatus): TemplateDraftStatus {
  return status.toLowerCase() as TemplateDraftStatus;
}

function fromPrismaSource(source: PrismaDraftSource): TemplateDraftSource {
  return source.toLowerCase() as TemplateDraftSource;
}

function toProvider(provider: string): TemplateDraftProvider {
  return provider === "deepseek" ? "deepseek" : "fallback";
}

function toIsoString(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function requireAccess(access: AccessContext | undefined): AccessContext {
  if (!access) throw forbiddenResourceError("Template draft");
  return access;
}

function requireMethod<T extends (...args: any[]) => any>(method: T | undefined, name: string): T {
  if (!method) throw new Error(`${name} is not available.`);
  return method;
}
