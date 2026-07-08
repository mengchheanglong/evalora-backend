import type { JsonValue, ModuleType, QuestionType } from "../../domain/evalora.types";

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

interface PrismaQuestionSeedData {
  id: string;
  questionText: string;
  questionType: string;
  options?: JsonValue;
  rubric: string[];
}

interface PrismaModuleSeedData {
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

export const PREBUILT_ASSESSMENT_TEMPLATES: PrebuiltAssessmentTemplateDefinition[] = [
  {
    id: "prebuilt-hr-generalist-assessment",
    title: "HR Generalist Assessment",
    description: "Prebuilt HR assessment covering behavioral judgment, communication, work style, and people-process problem solving.",
    roleType: "HR Generalist",
    timeLimitMin: 50,
    scoringRules: {
      passScore: 3.5,
      scale: "1-5",
      source: "prebuilt-default-v1",
      notes: "Use as a starter template; organizations can edit questions and weights before assigning candidates.",
    },
    modules: [
      {
        id: "prebuilt-hr-behavioral",
        type: "behavioral",
        title: "Behavioral Interview",
        description: "Checks judgment, confidentiality, fairness, and policy-aware people handling.",
        weight: 1.25,
        orderIndex: 1,
        settings: { recommendedMinutes: 15, allowFollowUps: true },
        questions: [
          {
            id: "prebuilt-hr-behavioral-sensitive-issue",
            questionText: "Tell us about a time you handled a sensitive employee or candidate issue while staying fair and confidential.",
            questionType: "scenario",
            rubric: ["confidentiality", "fairness", "empathy", "policy-awareness", "evidence"],
          },
          {
            id: "prebuilt-hr-behavioral-process-integrity",
            questionText: "How would you handle a hiring manager who wants to skip a required interview or documentation step?",
            questionType: "scenario",
            rubric: ["process-discipline", "stakeholder-communication", "risk-management", "professionalism"],
          },
        ],
      },
      {
        id: "prebuilt-hr-communication",
        type: "communication",
        title: "Candidate Communication Roleplay",
        description: "Assesses candidate-facing clarity, empathy, and expectation setting.",
        weight: 1.1,
        orderIndex: 2,
        settings: { recommendedMinutes: 12, roleplay: true },
        questions: [
          {
            id: "prebuilt-hr-communication-delayed-offer",
            questionText: "Roleplay explaining a delayed offer decision to a candidate while keeping trust and professionalism.",
            questionType: "roleplay",
            rubric: ["clarity", "empathy", "expectation-setting", "professionalism"],
          },
          {
            id: "prebuilt-hr-communication-pipeline-risk",
            questionText: "Write a concise update to a department head about a hiring pipeline risk and the next actions you recommend.",
            questionType: "short_answer",
            rubric: ["conciseness", "risk-framing", "action-orientation", "stakeholder-awareness"],
          },
        ],
      },
      {
        id: "prebuilt-hr-work-style",
        type: "work_style",
        title: "Work-Style Assessment",
        description: "Explores organization, collaboration, workload ownership, and documentation habits.",
        weight: 1,
        orderIndex: 3,
        settings: { recommendedMinutes: 10 },
        questions: [
          {
            id: "prebuilt-hr-work-style-workload",
            questionText: "Which work environment helps you perform best, and how do you communicate workload limits before quality drops?",
            questionType: "short_answer",
            rubric: ["self-awareness", "communication", "ownership", "prioritization"],
          },
          {
            id: "prebuilt-hr-work-style-documentation",
            questionText: "Rate how consistently you document hiring decisions and explain what you do when details are missing.",
            questionType: "scale",
            options: { min: 1, max: 5, labels: ["rarely", "always"] },
            rubric: ["documentation", "accountability", "process-consistency"],
          },
        ],
      },
      {
        id: "prebuilt-hr-problem-solving",
        type: "problem_solving",
        title: "People Process Problem Solving",
        description: "Tests structured diagnosis and improvement planning for HR operations.",
        weight: 1.15,
        orderIndex: 4,
        settings: { recommendedMinutes: 13 },
        questions: [
          {
            id: "prebuilt-hr-problem-solving-onboarding-dropoff",
            questionText: "A new-hire onboarding process has high drop-off in the first two weeks. How would you diagnose the causes and improve it?",
            questionType: "scenario",
            rubric: ["root-cause-analysis", "data-use", "stakeholder-collaboration", "implementation-plan", "measurement"],
          },
        ],
      },
    ],
  },
  {
    id: "prebuilt-software-engineer-assessment",
    title: "Software Engineer Assessment",
    description: "Prebuilt technical assessment covering AI interview, coding, debugging, and communication.",
    roleType: "Software Engineer",
    timeLimitMin: 75,
    scoringRules: {
      passScore: 3.6,
      scale: "1-5",
      source: "prebuilt-default-v1",
      notes: "Coding execution should come from the frontend/sandbox flow; backend evaluates submitted code text and execution evidence.",
    },
    modules: [
      {
        id: "prebuilt-se-ai-interview",
        type: "ai_interview",
        title: "Technical AI Interview",
        description: "Assesses engineering reasoning, ownership, trade-offs, and production awareness.",
        weight: 1.15,
        orderIndex: 1,
        settings: { recommendedMinutes: 15, allowFollowUps: true },
        questions: [
          {
            id: "prebuilt-se-ai-production-incident",
            questionText: "Tell us about a production incident or difficult technical bug you handled. What did you do and what changed afterward?",
            questionType: "scenario",
            rubric: ["technical-reasoning", "ownership", "incident-process", "learning", "communication"],
          },
          {
            id: "prebuilt-se-ai-tradeoffs",
            questionText: "Describe a technical trade-off you made between speed, reliability, maintainability, or cost. How did you choose?",
            questionType: "short_answer",
            rubric: ["trade-off-reasoning", "constraints", "impact-awareness", "clarity"],
          },
        ],
      },
      {
        id: "prebuilt-se-coding",
        type: "coding",
        title: "Coding Assessment",
        description: "Checks practical implementation quality using submitted code and execution evidence.",
        weight: 1.6,
        orderIndex: 2,
        settings: { recommendedMinutes: 30, language: "typescript", executionRequired: true },
        questions: [
          {
            id: "prebuilt-se-coding-normalize-scores",
            questionText: "Implement normalizeScores(scores) that accepts an array of numbers and returns values normalized from 0 to 100 while handling empty arrays, equal values, negative numbers, and invalid inputs.",
            questionType: "coding",
            options: {
              language: "typescript",
              examples: ["normalizeScores([10, 20, 30]) -> [0, 50, 100]", "normalizeScores([5, 5]) -> [100, 100]"],
              constraints: ["Do not mutate the input array", "Return [] for empty input", "Throw or clearly handle non-number values"],
            },
            rubric: ["correctness", "edge cases", "readability", "complexity", "test coverage"],
          },
        ],
      },
      {
        id: "prebuilt-se-debugging",
        type: "debugging",
        title: "Debugging Task",
        description: "Assesses structured investigation and safe remediation under production constraints.",
        weight: 1.25,
        orderIndex: 3,
        settings: { recommendedMinutes: 15 },
        questions: [
          {
            id: "prebuilt-se-debugging-slow-api",
            questionText: "An API endpoint became five times slower after a deployment. Walk through how you would diagnose, mitigate, and prevent the issue from recurring.",
            questionType: "scenario",
            rubric: ["hypothesis-building", "observability", "rollback-safety", "root-cause-analysis", "prevention"],
          },
        ],
      },
      {
        id: "prebuilt-se-communication",
        type: "communication",
        title: "Engineering Communication",
        description: "Checks ability to explain technical risk and collaborate with non-technical stakeholders.",
        weight: 1,
        orderIndex: 4,
        settings: { recommendedMinutes: 15 },
        questions: [
          {
            id: "prebuilt-se-communication-risk-update",
            questionText: "Explain a technical delay to a product manager in a way that is honest, concise, and includes recovery options.",
            questionType: "roleplay",
            rubric: ["clarity", "stakeholder-empathy", "risk-framing", "solution-orientation"],
          },
        ],
      },
    ],
  },
  {
    id: "prebuilt-team-leader-assessment",
    title: "Team Leader Assessment",
    description: "Prebuilt leadership assessment covering prioritization, conflict handling, communication, and problem solving.",
    roleType: "Team Leader",
    timeLimitMin: 60,
    scoringRules: {
      passScore: 3.6,
      scale: "1-5",
      source: "prebuilt-default-v1",
      notes: "Use for team lead, supervisor, project lead, or junior manager screens.",
    },
    modules: [
      {
        id: "prebuilt-leader-leadership",
        type: "leadership",
        title: "Leadership Scenario",
        description: "Assesses decision-making, accountability, conflict resolution, and team alignment.",
        weight: 1.45,
        orderIndex: 1,
        settings: { recommendedMinutes: 18, allowFollowUps: true },
        questions: [
          {
            id: "prebuilt-leader-leadership-conflict",
            questionText: "Two strong team members disagree publicly and progress is blocked. How would you handle the conflict and keep delivery moving?",
            questionType: "scenario",
            rubric: ["conflict-resolution", "decision-making", "team-alignment", "accountability", "communication"],
          },
          {
            id: "prebuilt-leader-leadership-missed-deadline",
            questionText: "Your team is likely to miss an important deadline. What do you communicate, what do you change, and how do you protect trust?",
            questionType: "scenario",
            rubric: ["prioritization", "stakeholder-management", "risk-management", "ownership"],
          },
        ],
      },
      {
        id: "prebuilt-leader-communication",
        type: "communication",
        title: "Leadership Communication Roleplay",
        description: "Checks feedback, stakeholder updates, and clarity under pressure.",
        weight: 1.15,
        orderIndex: 2,
        settings: { recommendedMinutes: 14, roleplay: true },
        questions: [
          {
            id: "prebuilt-leader-communication-feedback",
            questionText: "Roleplay giving constructive feedback to a high-performing teammate whose behavior is hurting collaboration.",
            questionType: "roleplay",
            rubric: ["specificity", "empathy", "directness", "action-plan", "psychological-safety"],
          },
        ],
      },
      {
        id: "prebuilt-leader-behavioral",
        type: "behavioral",
        title: "Leadership Behavior",
        description: "Explores ownership, coaching, adaptability, and team operating style.",
        weight: 1,
        orderIndex: 3,
        settings: { recommendedMinutes: 12 },
        questions: [
          {
            id: "prebuilt-leader-behavioral-coaching",
            questionText: "Tell us about a time you helped someone improve without taking the work away from them.",
            questionType: "short_answer",
            rubric: ["coaching", "delegation", "ownership", "outcome-evidence"],
          },
        ],
      },
      {
        id: "prebuilt-leader-problem-solving",
        type: "problem_solving",
        title: "Team Problem Solving",
        description: "Tests diagnosis and decision-making for ambiguous team delivery problems.",
        weight: 1.2,
        orderIndex: 4,
        settings: { recommendedMinutes: 16 },
        questions: [
          {
            id: "prebuilt-leader-problem-solving-quality-drop",
            questionText: "Quality has dropped for three sprints while the team still reports being busy. How would you find the real problem and fix the operating rhythm?",
            questionType: "scenario",
            rubric: ["root-cause-analysis", "metrics", "prioritization", "team-process", "follow-through"],
          },
        ],
      },
    ],
  },
];

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
