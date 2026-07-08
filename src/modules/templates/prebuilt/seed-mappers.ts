import type {
  PrebuiltAssessmentTemplateDefinition,
  PrebuiltModuleDefinition,
  PrebuiltQuestionDefinition,
  PrebuiltTemplateCreateData,
  PrebuiltTemplateSeedContext,
  PrebuiltTemplateUpdateData,
  PrismaModuleSeedData,
  PrismaQuestionSeedData,
} from "./types";

export function buildPrebuiltTemplateCreateData(
  template: PrebuiltAssessmentTemplateDefinition,
  context: PrebuiltTemplateSeedContext,
): PrebuiltTemplateCreateData {
  return {
    id: template.id,
    ...buildBaseTemplateData(template, context),
    modules: { create: template.modules.map(toPrismaModuleSeedData) },
  };
}

export function buildPrebuiltTemplateUpdateData(
  template: PrebuiltAssessmentTemplateDefinition,
  context: PrebuiltTemplateSeedContext,
): PrebuiltTemplateUpdateData {
  return {
    ...buildBaseTemplateData(template, context),
    modules: {
      deleteMany: {},
      create: template.modules.map(toPrismaModuleSeedData),
    },
  };
}

function buildBaseTemplateData(template: PrebuiltAssessmentTemplateDefinition, context: PrebuiltTemplateSeedContext) {
  return {
    title: template.title,
    description: template.description,
    roleType: template.roleType,
    timeLimitMin: template.timeLimitMin,
    scoringRules: template.scoringRules,
    createdById: context.createdById,
    organizationId: context.organizationId,
  };
}

function toPrismaModuleSeedData(module: PrebuiltModuleDefinition): PrismaModuleSeedData {
  return {
    id: module.id,
    moduleType: toPrismaEnum(module.type),
    title: module.title,
    description: module.description,
    weight: module.weight,
    orderIndex: module.orderIndex,
    settings: module.settings,
    questions: { create: module.questions.map(toPrismaQuestionSeedData) },
  };
}

function toPrismaQuestionSeedData(question: PrebuiltQuestionDefinition): PrismaQuestionSeedData {
  return {
    id: question.id,
    questionText: question.questionText,
    questionType: toPrismaEnum(question.questionType),
    options: question.options,
    rubric: question.rubric,
  };
}

function toPrismaEnum(value: string): string {
  return value.toUpperCase();
}
