import { test } from "node:test";
import { strict as assert } from "node:assert";
import { TemplatesService } from "../src/modules/templates/templates.service";
import { PREBUILT_ASSESSMENT_TEMPLATES } from "../src/modules/templates/prebuilt-templates";

const access = { userId: "owner-1", role: "organization" as const, organizationId: "org-1" };

test("listCatalog returns all prebuilt blueprints with module counts", () => {
  const service = new TemplatesService({} as never);
  const catalog = service.listCatalog();
  assert.equal(catalog.length, PREBUILT_ASSESSMENT_TEMPLATES.length);
  assert.ok(catalog.every((item) => item.source === "prebuilt"));
  assert.ok(catalog.every((item) => item.moduleCount > 0 && item.questionCount > 0));
  assert.ok(catalog.some((item) => item.id.includes("software-engineer")));
});

test("getCatalogTemplate returns full nested modules for preview", () => {
  const service = new TemplatesService({} as never);
  const first = PREBUILT_ASSESSMENT_TEMPLATES[0];
  const detail = service.getCatalogTemplate(first.id);
  assert.equal(detail.id, first.id);
  assert.equal(detail.modules.length, first.modules.length);
  assert.ok((detail.modules[0].questions?.length ?? 0) > 0);
});

test("cloneFromCatalog creates an org-owned template with new content via create", async () => {
  const created: any[] = [];
  const service = new TemplatesService({
    assessmentTemplate: {
      create: async (args: any) => {
        created.push(args);
        return {
          id: "cloned-template-1",
          title: args.data.title,
          description: args.data.description,
          roleType: args.data.roleType,
          timeLimitMin: args.data.timeLimitMin,
          scoringRules: args.data.scoringRules,
          createdById: args.data.createdById,
          organizationId: args.data.organizationId,
          modules: (args.data.modules?.create ?? []).map((module: any, index: number) => ({
            id: `mod-${index}`,
            moduleType: module.moduleType,
            title: module.title,
            description: module.description,
            weight: module.weight,
            orderIndex: module.orderIndex,
            settings: module.settings,
            questions: (module.questions?.create ?? []).map((question: any, qIndex: number) => ({
              id: `q-${index}-${qIndex}`,
              questionText: question.questionText,
              questionType: question.questionType,
              options: question.options,
              rubric: question.rubric,
            })),
          })),
        };
      },
    },
  } as never);

  const catalogId = PREBUILT_ASSESSMENT_TEMPLATES[0].id;
  const cloned = await service.cloneFromCatalog({ catalogId, title: "My SE Pack" }, access);

  assert.equal(cloned.title, "My SE Pack");
  assert.equal(cloned.organizationId, "org-1");
  assert.equal(created.length, 1);
  assert.equal(created[0].data.organizationId, "org-1");
  assert.equal(created[0].data.createdById, "owner-1");
  assert.ok((created[0].data.modules.create?.length ?? 0) > 0);
  // Clone must not force catalog fixed IDs onto new rows (create payload has no top-level fixed catalog id).
  assert.equal(created[0].data.id, undefined);
});

test("cloneFromCatalog rejects unknown catalog ids", async () => {
  const service = new TemplatesService({} as never);
  await assert.rejects(
    () => service.cloneFromCatalog({ catalogId: "does-not-exist" }, access),
    /not found/i,
  );
});

test("duplicateTemplate deep-copies an org-owned template with a Copy suffix", async () => {
  const created: any[] = [];
  const source = {
    id: "tpl-source-1",
    title: "My SE Pack",
    description: "Org copy",
    roleType: "Software Engineer",
    timeLimitMin: 75,
    scoringRules: { advisoryOnly: true },
    createdById: "owner-1",
    organizationId: "org-1",
    modules: [
      {
        id: "mod-1",
        moduleType: "CODING" as const,
        title: "Coding",
        description: "JS tasks",
        weight: 1.5,
        orderIndex: 1,
        settings: null,
        questions: [
          {
            id: "q-1",
            questionText: "Solve pair sum",
            questionType: "CODING" as const,
            options: null,
            rubric: null,
          },
        ],
      },
    ],
  };

  const service = new TemplatesService({
    assessmentTemplate: {
      findFirst: async () => source,
      create: async (args: any) => {
        created.push(args);
        return {
          id: "tpl-copy-1",
          title: args.data.title,
          description: args.data.description,
          roleType: args.data.roleType,
          timeLimitMin: args.data.timeLimitMin,
          scoringRules: args.data.scoringRules,
          createdById: args.data.createdById,
          organizationId: args.data.organizationId,
          modules: (args.data.modules?.create ?? []).map((module: any, index: number) => ({
            id: `mod-copy-${index}`,
            moduleType: module.moduleType,
            title: module.title,
            description: module.description,
            weight: module.weight,
            orderIndex: module.orderIndex,
            settings: module.settings,
            questions: (module.questions?.create ?? []).map((question: any, qIndex: number) => ({
              id: `q-copy-${index}-${qIndex}`,
              questionText: question.questionText,
              questionType: question.questionType,
              options: question.options,
              rubric: question.rubric,
            })),
          })),
        };
      },
    },
  } as never);

  const copy = await service.duplicateTemplate("tpl-source-1", access);
  assert.equal(copy.title, "My SE Pack (Copy)");
  assert.equal(copy.organizationId, "org-1");
  assert.equal(created.length, 1);
  assert.equal(created[0].data.id, undefined);
  assert.equal(created[0].data.modules.create[0].moduleType, "CODING");
});
