import { Injectable } from "@nestjs/common";
import type { AssessmentModuleDto, AssessmentTemplateDto, JsonValue, ModuleType, QuestionDto, QuestionType } from "../../domain/evalora.types";

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

interface TemplatePrismaClient {
  assessmentTemplate: {
    create(args: unknown): Promise<TemplateRow>;
    findMany(args: unknown): Promise<TemplateRow[]>;
    findUnique(args: unknown): Promise<TemplateRow | null>;
    update(args: unknown): Promise<TemplateRow>;
    delete(args: unknown): Promise<TemplateRow>;
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

export const TEMPLATE_INCLUDE = {
  modules: {
    include: { questions: true },
    orderBy: { orderIndex: "asc" },
  },
};

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: TemplatePrismaClient) {}

  async listTemplates(organizationId?: string): Promise<AssessmentTemplateDto[]> {
    const templates = await this.prisma.assessmentTemplate.findMany({
      where: organizationId ? { organizationId } : undefined,
      include: TEMPLATE_INCLUDE,
      orderBy: { updatedAt: "desc" },
    });

    return templates.map(toTemplateDto);
  }

  async getTemplate(id: string): Promise<AssessmentTemplateDto | null> {
    const template = await this.prisma.assessmentTemplate.findUnique({
      where: { id },
      include: TEMPLATE_INCLUDE,
    });

    return template ? toTemplateDto(template) : null;
  }

  async createTemplate(input: CreateTemplateInput): Promise<AssessmentTemplateDto> {
    const template = await this.prisma.assessmentTemplate.create({
      data: {
        title: requireNonEmpty(input.title, "Template title is required."),
        description: input.description,
        roleType: requireNonEmpty(input.roleType, "Template role type is required."),
        timeLimitMin: input.timeLimitMin,
        scoringRules: input.scoringRules,
        createdById: requireNonEmpty(input.createdById, "Template creator is required."),
        organizationId: input.organizationId,
        modules: { create: (input.modules ?? []).map(toPrismaModuleCreate) },
      },
      include: TEMPLATE_INCLUDE,
    });

    return toTemplateDto(template);
  }

  async updateTemplate(id: string, input: UpdateTemplateInput): Promise<AssessmentTemplateDto> {
    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = requireNonEmpty(input.title, "Template title is required.");
    if (input.description !== undefined) data.description = input.description;
    if (input.roleType !== undefined) data.roleType = requireNonEmpty(input.roleType, "Template role type is required.");
    if (input.timeLimitMin !== undefined) data.timeLimitMin = input.timeLimitMin;
    if (input.scoringRules !== undefined) data.scoringRules = input.scoringRules;
    if (input.organizationId !== undefined) data.organizationId = input.organizationId;
    if (input.modules !== undefined) {
      data.modules = {
        deleteMany: {},
        create: input.modules.map(toPrismaModuleCreate),
      };
    }

    const template = await this.prisma.assessmentTemplate.update({
      where: { id },
      data,
      include: TEMPLATE_INCLUDE,
    });

    return toTemplateDto(template);
  }

  async deleteTemplate(id: string): Promise<{ id: string; deleted: true }> {
    const deleted = await this.prisma.assessmentTemplate.delete({ where: { id } });
    return { id: deleted.id, deleted: true };
  }
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
