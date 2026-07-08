import type { JsonValue, ModuleType, QuestionType } from "../../../domain/evalora.types";

export interface PrebuiltQuestionDefinition {
  id: string;
  questionText: string;
  questionType: QuestionType;
  options?: JsonValue;
  rubric: string[];
}

export interface PrebuiltModuleDefinition {
  id: string;
  type: ModuleType;
  title: string;
  description: string;
  weight: number;
  orderIndex: number;
  settings?: JsonValue;
  questions: PrebuiltQuestionDefinition[];
}

export interface PrebuiltAssessmentTemplateDefinition {
  id: string;
  title: string;
  description: string;
  roleType: string;
  timeLimitMin: number;
  scoringRules: JsonValue;
  modules: PrebuiltModuleDefinition[];
}

export interface PrebuiltTemplateSeedContext {
  createdById: string;
  organizationId?: string;
}

export interface PrismaQuestionSeedData {
  id: string;
  questionText: string;
  questionType: string;
  options?: JsonValue;
  rubric: string[];
}

export interface PrismaModuleSeedData {
  id: string;
  moduleType: string;
  title: string;
  description: string;
  weight: number;
  orderIndex: number;
  settings?: JsonValue;
  questions: { create: PrismaQuestionSeedData[] };
}

export interface PrebuiltTemplateCreateData {
  id: string;
  title: string;
  description: string;
  roleType: string;
  timeLimitMin: number;
  scoringRules: JsonValue;
  createdById: string;
  organizationId?: string;
  modules: { create: PrismaModuleSeedData[] };
}

export interface PrebuiltTemplateUpdateData extends Omit<PrebuiltTemplateCreateData, "id" | "modules"> {
  modules: {
    deleteMany: Record<string, never>;
    create: PrismaModuleSeedData[];
  };
}
