import { test } from "node:test";
import { strict as assert } from "node:assert";
import { TemplatesService } from "../src/modules/templates/templates.service";

const templateRow = {
  id: "template-1",
  title: "Backend Engineer Assessment",
  description: "Technical backend screen",
  roleType: "Backend Engineer",
  timeLimitMin: 60,
  scoringRules: { passScore: 3.5 },
  createdById: "user-1",
  organizationId: "org-1",
  modules: [
    {
      id: "module-1",
      moduleType: "AI_INTERVIEW",
      title: "AI Interview",
      description: "Scenario questions",
      weight: 1.25,
      orderIndex: 1,
      settings: { followUps: true },
      questions: [
        {
          id: "question-1",
          questionText: "Tell us about a production incident.",
          questionType: "SCENARIO",
          options: null,
          rubric: ["clarity", "ownership"],
        },
      ],
    },
  ],
};

test("createTemplate maps nested modules and questions to Prisma create input", async () => {
  const calls: unknown[] = [];
  const service = new TemplatesService({
    assessmentTemplate: {
      create: async (args: unknown) => {
        calls.push(args);
        return templateRow;
      },
    },
  });

  const result = await service.createTemplate({
    title: "Backend Engineer Assessment",
    description: "Technical backend screen",
    roleType: "Backend Engineer",
    timeLimitMin: 60,
    scoringRules: { passScore: 3.5 },
    createdById: "user-1",
    organizationId: "org-1",
    modules: [
      {
        type: "ai_interview",
        title: "AI Interview",
        description: "Scenario questions",
        weight: 1.25,
        orderIndex: 1,
        settings: { followUps: true },
        questions: [
          {
            questionText: "Tell us about a production incident.",
            questionType: "scenario",
            rubric: ["clarity", "ownership"],
          },
        ],
      },
    ],
  });

  assert.equal(result.id, "template-1");
  assert.equal(result.modules[0].type, "ai_interview");
  assert.equal(result.modules[0].questions?.[0].questionType, "scenario");

  assert.deepEqual(calls[0], {
    data: {
      title: "Backend Engineer Assessment",
      description: "Technical backend screen",
      roleType: "Backend Engineer",
      timeLimitMin: 60,
      scoringRules: { passScore: 3.5 },
      createdById: "user-1",
      organizationId: "org-1",
      modules: {
        create: [
          {
            moduleType: "AI_INTERVIEW",
            title: "AI Interview",
            description: "Scenario questions",
            weight: 1.25,
            orderIndex: 1,
            settings: { followUps: true },
            questions: {
              create: [
                {
                  questionText: "Tell us about a production incident.",
                  questionType: "SCENARIO",
                  options: undefined,
                  rubric: ["clarity", "ownership"],
                },
              ],
            },
          },
        ],
      },
    },
    include: {
      modules: {
        include: { questions: true },
        orderBy: { orderIndex: "asc" },
      },
    },
  });
});

test("interviewer can create templates within their organization", async () => {
  const calls: unknown[] = [];
  const service = new TemplatesService({
    assessmentTemplate: {
      create: async (args: unknown) => {
        calls.push(args);
        return templateRow;
      },
    },
  });

  await service.createTemplate(
    {
      title: "Interviewer Assessment",
      roleType: "Software Engineer",
      createdById: "ignored-client-user",
      organizationId: "ignored-client-org",
    },
    { userId: "interviewer-1", role: "interviewer", organizationId: "org-1" },
  );

  assert.deepEqual(calls[0], {
    data: {
      title: "Interviewer Assessment",
      description: undefined,
      roleType: "Software Engineer",
      timeLimitMin: undefined,
      scoringRules: undefined,
      createdById: "interviewer-1",
      organizationId: "org-1",
      modules: { create: [] },
    },
    include: {
      modules: {
        include: { questions: true },
        orderBy: { orderIndex: "asc" },
      },
    },
  });
});

test("updateTemplate replaces nested modules so template edits stay in sync", async () => {
  const calls: unknown[] = [];
  const service = new TemplatesService({
    assessmentTemplate: {
      update: async (args: unknown) => {
        calls.push(args);
        return templateRow;
      },
    },
  });

  await service.updateTemplate("template-1", {
    title: "Updated Backend Assessment",
    modules: [
      {
        type: "coding",
        title: "Coding",
        description: "Problem solving",
        weight: 2,
        orderIndex: 1,
        questions: [{ questionText: "Solve fizzbuzz.", questionType: "coding" }],
      },
    ],
  });

  assert.deepEqual(calls[0], {
    where: { id: "template-1" },
    data: {
      title: "Updated Backend Assessment",
      modules: {
        deleteMany: {},
        create: [
          {
            moduleType: "CODING",
            title: "Coding",
            description: "Problem solving",
            weight: 2,
            orderIndex: 1,
            settings: undefined,
            questions: {
              create: [
                {
                  questionText: "Solve fizzbuzz.",
                  questionType: "CODING",
                  options: undefined,
                  rubric: undefined,
                },
              ],
            },
          },
        ],
      },
    },
    include: {
      modules: {
        include: { questions: true },
        orderBy: { orderIndex: "asc" },
      },
    },
  });
});

test("listTemplates and getTemplate map Prisma rows to API DTOs", async () => {
  const service = new TemplatesService({
    assessmentTemplate: {
      findMany: async () => [templateRow],
      findUnique: async () => templateRow,
    },
  });

  const templates = await service.listTemplates();
  const template = await service.getTemplate("template-1");

  assert.equal(templates[0].modules[0].questions?.[0].questionText, "Tell us about a production incident.");
  assert.equal(template?.modules[0].questions?.[0].rubric?.[0], "clarity");
});
