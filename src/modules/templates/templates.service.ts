import { Injectable } from "@nestjs/common";
import type { AssessmentModuleDto, AssessmentTemplateDto, JsonValue, ModuleType, QuestionDto, QuestionType } from "../../domain/evalora.types";
import { assertCanWriteOrganizationResource, buildTemplateOwnershipWhere, forbiddenResourceError, mergeWhere, requireOrganizationId, type AccessContext } from "../auth/access-control";

type PrismaModuleType = "AI_INTERVIEW" | "CODING" | "DEBUGGING" | "WORK_STYLE" | "BEHAVIORAL" | "LEADERSHIP" | "COMMUNICATION" | "PROBLEM_SOLVING";
type PrismaQuestionType = "MCQ" | "SCALE" | "SHORT_ANSWER" | "CODING" | "SCENARIO" | "ROLEPLAY";

interface TemplateQuestionRow {
  id: string;
  questionText: string;
  questionType: PrismaQuestionType;
  options?: JsonValue | null;
  rubric?: JsonValue | null;
}

interface TemplateModuleRow {
  id: string;
  moduleType: PrismaModuleType;
  title: string;
  description?: string | null;
  weight: number;
  orderIndex: number;
  settings?: JsonValue | null;
  questions?: TemplateQuestionRow[];
}

interface TemplateRow {
  id: string;
  title: string;
  description?: string | null;
  roleType: string;
  timeLimitMin?: number | null;
  scoringRules?: JsonValue | null;
  createdById?: string;
  organizationId?: string | null;
  modules?: TemplateModuleRow[];
}

type TemplateCreateFn = (args: any) => Promise<TemplateRow>;
type TemplateFindManyFn = (args: any) => Promise<TemplateRow[]>;
type TemplateFindUniqueFn = (args: any) => Promise<TemplateRow | null>;
type TemplateFindFirstFn = (args: any) => Promise<TemplateRow | null>;
type TemplateUpdateFn = (args: any) => Promise<TemplateRow>;
type TemplateDeleteFn = (args: any) => Promise<TemplateRow>;

interface TemplatePrismaClient {
  assessmentTemplate: {
    create?: TemplateCreateFn;
    findMany?: TemplateFindManyFn;
    findUnique?: TemplateFindUniqueFn;
    findFirst?: TemplateFindFirstFn;
    update?: TemplateUpdateFn;
    delete?: TemplateDeleteFn;
  };
}

export interface TemplateQuestionInput {
  questionText: string;
  questionType: QuestionType;
  options?: JsonValue;
  rubric?: JsonValue;
}

export interface TemplateModuleInput {
  type: ModuleType;
  title: string;
  description?: string;
  weight?: number;
  orderIndex?: number;
  settings?: JsonValue;
  questions?: TemplateQuestionInput[];
}

export interface CreateTemplateInput {
  title?: string;
  description?: string;
  roleType?: string;
  timeLimitMin?: number;
  scoringRules?: JsonValue;
  createdById?: string;
  organizationId?: string;
  modules?: TemplateModuleInput[];
}

export type UpdateTemplateInput = Partial<Omit<CreateTemplateInput, "createdById">>;

export interface ListTemplatesOptions {
  organizationId?: string;
  access?: AccessContext;
}

export const TEMPLATE_INCLUDE = {
  modules: {
    include: { questions: true },
    orderBy: { orderIndex: "asc" },
  },
};

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: TemplatePrismaClient) {}

  async listTemplates(options: string | ListTemplatesOptions = {}): Promise<AssessmentTemplateDto[]> {
    const normalized = typeof options === "string" ? { organizationId: options } : options;
    const findMany = requireMethod(this.prisma.assessmentTemplate.findMany, "assessmentTemplate.findMany");
    const templates = await findMany({
      where: buildListTemplateWhere(normalized),
      include: TEMPLATE_INCLUDE,
      orderBy: { updatedAt: "desc" },
    });

    return templates.map(toTemplateDto);
  }

  async getTemplate(id: string, access?: AccessContext): Promise<AssessmentTemplateDto | null> {
    if (access) {
      const findFirst = requireMethod(this.prisma.assessmentTemplate.findFirst, "assessmentTemplate.findFirst");
      const template = await findFirst({
        where: mergeWhere({ id }, buildTemplateOwnershipWhere(access)),
        include: TEMPLATE_INCLUDE,
      });
      return template ? toTemplateDto(template) : null;
    }

    const findUnique = requireMethod(this.prisma.assessmentTemplate.findUnique, "assessmentTemplate.findUnique");
    const template = await findUnique({
      where: { id },
      include: TEMPLATE_INCLUDE,
    });

    return template ? toTemplateDto(template) : null;
  }

  async createTemplate(input: CreateTemplateInput, access?: AccessContext): Promise<AssessmentTemplateDto> {
    assertCanWriteOrganizationResource(access);
    const create = requireMethod(this.prisma.assessmentTemplate.create, "assessmentTemplate.create");
    const template = await create({
      data: {
        title: requireNonEmpty(input.title, "Template title is required."),
        description: input.description,
        roleType: requireNonEmpty(input.roleType, "Template role type is required."),
        timeLimitMin: input.timeLimitMin,
        scoringRules: input.scoringRules,
        createdById: access?.userId ?? requireNonEmpty(input.createdById, "Template creator is required."),
        organizationId: resolveWritableOrganizationId(input.organizationId, access),
        modules: { create: (input.modules ?? []).map(toPrismaModuleCreate) },
      },
      include: TEMPLATE_INCLUDE,
    });

    return toTemplateDto(template);
  }

  async updateTemplate(id: string, input: UpdateTemplateInput, access?: AccessContext): Promise<AssessmentTemplateDto> {
    assertCanWriteOrganizationResource(access);
    await this.assertTemplateAccess(id, access);

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = requireNonEmpty(input.title, "Template title is required.");
    if (input.description !== undefined) data.description = input.description;
    if (input.roleType !== undefined) data.roleType = requireNonEmpty(input.roleType, "Template role type is required.");
    if (input.timeLimitMin !== undefined) data.timeLimitMin = input.timeLimitMin;
    if (input.scoringRules !== undefined) data.scoringRules = input.scoringRules;
    if (input.organizationId !== undefined || access) data.organizationId = resolveWritableOrganizationId(input.organizationId, access);
    if (input.modules !== undefined) {
      data.modules = {
        deleteMany: {},
        create: input.modules.map(toPrismaModuleCreate),
      };
    }

    const update = requireMethod(this.prisma.assessmentTemplate.update, "assessmentTemplate.update");
    const template = await update({
      where: { id },
      data,
      include: TEMPLATE_INCLUDE,
    });

    return toTemplateDto(template);
  }

  async deleteTemplate(id: string, access?: AccessContext): Promise<{ id: string; deleted: true }> {
    assertCanWriteOrganizationResource(access);
    await this.assertTemplateAccess(id, access);

    const deleteTemplate = requireMethod(this.prisma.assessmentTemplate.delete, "assessmentTemplate.delete");
    const deleted = await deleteTemplate({ where: { id } });
    return { id: deleted.id, deleted: true };
  }

  private async assertTemplateAccess(id: string, access?: AccessContext): Promise<void> {
    if (!access || access.role === "admin") return;
    const findFirst = requireMethod(this.prisma.assessmentTemplate.findFirst, "assessmentTemplate.findFirst");
    const template = await findFirst({ where: mergeWhere({ id }, buildTemplateOwnershipWhere(access)) });
    if (!template) throw forbiddenResourceError("Template");
  }
}

function buildListTemplateWhere(options: ListTemplatesOptions): Record<string, unknown> | undefined {
  const requested = options.organizationId ? { organizationId: options.organizationId } : undefined;
  return mergeWhere(requested, buildTemplateOwnershipWhere(options.access));
}

function resolveWritableOrganizationId(requestedOrganizationId: string | undefined, access?: AccessContext): string | undefined {
  if (!access || access.role === "admin") return requestedOrganizationId;
  return requireOrganizationId(access);
}

function toPrismaModuleCreate(module: TemplateModuleInput) {
  return {
    moduleType: toPrismaModuleType(module.type),
    title: requireNonEmpty(module.title, "Module title is required."),
    description: module.description,
    weight: module.weight ?? 1,
    orderIndex: module.orderIndex ?? 1,
    settings: module.settings,
    questions: { create: (module.questions ?? []).map(toPrismaQuestionCreate) },
  };
}

function toPrismaQuestionCreate(question: TemplateQuestionInput) {
  return {
    questionText: requireNonEmpty(question.questionText, "Question text is required."),
    questionType: toPrismaQuestionType(question.questionType),
    options: question.options,
    rubric: question.rubric,
  };
}

function toTemplateDto(template: TemplateRow): AssessmentTemplateDto {
  return {
    id: template.id,
    title: template.title,
    description: template.description ?? "",
    roleType: template.roleType,
    timeLimitMin: template.timeLimitMin ?? undefined,
    scoringRules: template.scoringRules ?? undefined,
    createdById: template.createdById,
    organizationId: template.organizationId ?? undefined,
    modules: (template.modules ?? []).map(toModuleDto),
  };
}

function toModuleDto(module: TemplateModuleRow): AssessmentModuleDto {
  return {
    id: module.id,
    type: fromPrismaModuleType(module.moduleType),
    title: module.title,
    description: module.description ?? "",
    weight: module.weight,
    orderIndex: module.orderIndex,
    settings: module.settings ?? undefined,
    questions: (module.questions ?? []).map(toQuestionDto),
  };
}

function toQuestionDto(question: TemplateQuestionRow): QuestionDto {
  return {
    id: question.id,
    questionText: question.questionText,
    questionType: fromPrismaQuestionType(question.questionType),
    options: question.options ?? undefined,
    rubric: question.rubric ?? undefined,
  };
}

function toPrismaModuleType(type: ModuleType): PrismaModuleType {
  return type.toUpperCase() as PrismaModuleType;
}

function fromPrismaModuleType(type: PrismaModuleType): ModuleType {
  return type.toLowerCase() as ModuleType;
}

function toPrismaQuestionType(type: QuestionType): PrismaQuestionType {
  return type.toUpperCase() as PrismaQuestionType;
}

function fromPrismaQuestionType(type: PrismaQuestionType): QuestionType {
  return type.toLowerCase() as QuestionType;
}

function requireNonEmpty(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function requireMethod<T extends (...args: any[]) => any>(method: T | undefined, name: string): T {
  if (!method) throw new Error(`${name} is not available.`);
  return method;
}
