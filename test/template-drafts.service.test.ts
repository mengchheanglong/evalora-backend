import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { AccessContext } from "../src/modules/auth/access-control";
import { TOTAL_WEIGHT } from "../src/modules/templates/drafts/draft.constants";
import { TemplateDraftsService } from "../src/modules/templates/drafts/template-drafts.service";

const ownerAccess: AccessContext = { userId: "user-1", role: "organization", organizationId: "org-1" };
const otherOrgAccess: AccessContext = { userId: "user-9", role: "interviewer", organizationId: "org-2" };

const proposal = {
  title: "Backend Engineer Assessment",
  description: "Screen for backend fundamentals",
  roleType: "Backend Engineer",
  timeLimitMin: 90,
  modules: [
    {
      type: "coding",
      title: "Coding Assessment",
      description: "Practical task",
      weightRationale: "Coding is the core of the role.",
      weightSignals: { roleImportance: 5, riskIfWeak: 5, evidenceVolume: 5, difficulty: 4, essential: true },
      questions: [{ questionText: "Implement a rate limiter.", questionType: "coding", rubric: ["correctness"] }],
    },
    {
      type: "communication",
      title: "Communication",
      description: "Stakeholder updates",
      weightRationale: "Backend engineers write more than code.",
      weightSignals: { roleImportance: 3, riskIfWeak: 3, evidenceVolume: 3, difficulty: 2, essential: false },
      questions: [{ questionText: "Explain an outage to a customer.", questionType: "roleplay", rubric: ["clarity"] }],
    },
  ],
};

/** Minimal in-memory stand-in for the Prisma draft delegate. */
function createPrismaStub(seed: Record<string, any> = {}) {
  const rows = new Map<string, any>(Object.entries(seed));
  let sequence = 0;

  return {
    rows,
    assessmentTemplateDraft: {
      create: async ({ data }: any) => {
        const id = `draft-${(sequence += 1)}`;
        const row = { id, createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z"), ...data };
        rows.set(id, row);
        return row;
      },
      findMany: async ({ where }: any) => [...rows.values()].filter((row) => matches(row, where)),
      findFirst: async ({ where }: any) => [...rows.values()].find((row) => matches(row, where)) ?? null,
      update: async ({ where, data }: any) => {
        const row = { ...rows.get(where.id), ...data };
        rows.set(where.id, row);
        return row;
      },
    },
  };
}

function matches(row: any, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function createAiStub(next: typeof proposal | "unavailable") {
  return {
    generateTemplateDraft: async () =>
      next === "unavailable"
        ? { provider: "fallback" as const }
        : { proposal: next as any, provider: "deepseek" as const },
  };
}

function createTemplatesStub() {
  const created: any[] = [];
  return {
    created,
    createTemplate: async (input: any) => {
      created.push(input);
      return { id: "template-1", title: input.title, description: "", roleType: input.roleType, modules: [] };
    },
  };
}

function createService(options: { prisma?: any; ai?: any; templates?: any } = {}) {
  const prisma = options.prisma ?? createPrismaStub();
  const ai = options.ai ?? createAiStub(proposal);
  const templates = options.templates ?? createTemplatesStub();
  return { service: new TemplateDraftsService(prisma, ai as any, templates as any), prisma, ai, templates };
}

test("generating a draft writes a draft row and never a template", async () => {
  const { service, prisma, templates } = createService();

  const draft = await service.generateDraft({ idea: "We need a backend engineer for our payments team." }, ownerAccess);

  assert.equal(draft.status, "draft");
  assert.equal(draft.provider, "deepseek");
  assert.equal(draft.source, "prompt");
  assert.equal(draft.draft.modules.length, 2);
  assert.equal(draft.draft.modules.reduce((sum, module) => sum + module.weight, 0), TOTAL_WEIGHT);
  assert.equal(prisma.rows.size, 1);
  assert.equal(templates.created.length, 0, "generation must not create a template");
});

test("an uploaded document is recorded as the draft source and its text is stored", async () => {
  const { service, prisma } = createService();

  const draft = await service.generateDraft(
    { sourceText: "Backend engineer. Owns payment services.", sourceFileName: "jd.pdf" },
    ownerAccess,
  );

  assert.equal(draft.source, "document");
  assert.equal(draft.sourceFileName, "jd.pdf");
  assert.equal([...prisma.rows.values()][0].sourceText, "Backend engineer. Owns payment services.");
  assert.equal([...prisma.rows.values()][0].organizationId, "org-1");
});

test("generation requires either a document or a written idea", async () => {
  const { service } = createService();
  await assert.rejects(() => service.generateDraft({}, ownerAccess), /Upload a job description|describe the role/i);
});

test("an unavailable provider still yields an editable draft, flagged as a fallback", async () => {
  const { service, templates } = createService({ ai: createAiStub("unavailable") });

  const draft = await service.generateDraft({ roleType: "Software Engineer", idea: "Backend hire" }, ownerAccess);

  assert.equal(draft.provider, "fallback");
  assert.ok(draft.draft.modules.length > 0, "fallback drafts still need modules");
  assert.equal(draft.draft.modules.reduce((sum, module) => sum + module.weight, 0), TOTAL_WEIGHT);
  assert.match(draft.draft.warnings.join(" "), /AI assistant was unavailable/i);
  assert.equal(templates.created.length, 0);
});

test("confirming a draft delegates to the template service and marks the draft published", async () => {
  const { service, prisma, templates } = createService();
  const draft = await service.generateDraft({ idea: "Backend engineer" }, ownerAccess);

  const template = await service.confirmDraft(draft.id, {}, ownerAccess);

  assert.equal(template.id, "template-1");
  assert.equal(templates.created.length, 1);
  const created = templates.created[0];
  assert.equal(created.title, "Backend Engineer Assessment");
  assert.equal(created.roleType, "Backend Engineer");
  assert.equal(created.modules.reduce((sum: number, module: any) => sum + module.weight, 0), TOTAL_WEIGHT);
  assert.equal(created.scoringRules.generatedFromDraftId, draft.id);
  assert.equal(created.scoringRules.advisoryOnly, true);
  assert.equal(created.scoringRules.weightBasis.length, 2);
  assert.ok(created.scoringRules.weightBasis.every((entry: any) => typeof entry.rationale === "string" && entry.rationale));

  const row = prisma.rows.get(draft.id);
  assert.equal(row.status, "PUBLISHED");
  assert.equal(row.publishedTemplateId, "template-1");
});

test("a draft cannot be published twice", async () => {
  const { service } = createService();
  const draft = await service.generateDraft({ idea: "Backend engineer" }, ownerAccess);
  await service.confirmDraft(draft.id, {}, ownerAccess);

  await assert.rejects(() => service.confirmDraft(draft.id, {}, ownerAccess), /already published/i);
});

test("a discarded draft can no longer be edited or published", async () => {
  const { service } = createService();
  const draft = await service.generateDraft({ idea: "Backend engineer" }, ownerAccess);

  const discarded = await service.discardDraft(draft.id, ownerAccess);
  assert.equal(discarded.status, "discarded");

  await assert.rejects(() => service.confirmDraft(draft.id, {}, ownerAccess), /discarded/i);
  await assert.rejects(() => service.updateDraft(draft.id, { modules: [] }, ownerAccess), /discarded/i);
});

test("a published draft is kept as provenance rather than discarded", async () => {
  const { service } = createService();
  const draft = await service.generateDraft({ idea: "Backend engineer" }, ownerAccess);
  await service.confirmDraft(draft.id, {}, ownerAccess);

  await assert.rejects(() => service.discardDraft(draft.id, ownerAccess), /already published/i);
});

test("edits are re-normalized, so a reviewer cannot publish weights that miss 100", async () => {
  const { service, templates } = createService();
  const draft = await service.generateDraft({ idea: "Backend engineer" }, ownerAccess);

  const edited = await service.updateDraft(
    draft.id,
    {
      title: "Payments Engineer Assessment",
      roleType: "Payments Engineer",
      timeLimitMin: 45,
      modules: draft.draft.modules.map((module, index) => ({ ...module, weight: index === 0 ? 90 : 3 })),
    },
    ownerAccess,
  );

  assert.equal(edited.draft.title, "Payments Engineer Assessment");
  assert.equal(edited.draft.timeLimitMin, 45);
  assert.equal(edited.draft.modules.reduce((sum, module) => sum + module.weight, 0), TOTAL_WEIGHT);

  await service.confirmDraft(draft.id, {}, ownerAccess);
  assert.equal(templates.created[0].title, "Payments Engineer Assessment");
  assert.equal(templates.created[0].modules.reduce((sum: number, module: any) => sum + module.weight, 0), TOTAL_WEIGHT);
});

test("confirming publishes the edited draft, not the original AI proposal", async () => {
  const { service, templates } = createService();
  const draft = await service.generateDraft({ idea: "Backend engineer" }, ownerAccess);

  await service.updateDraft(
    draft.id,
    { modules: [{ ...draft.draft.modules[0], title: "Reviewer-approved coding task" }] },
    ownerAccess,
  );
  await service.confirmDraft(draft.id, {}, ownerAccess);

  const created = templates.created[0];
  assert.equal(created.modules.length, 1);
  assert.equal(created.modules[0].title, "Reviewer-approved coding task");
});

test("the original AI proposal is preserved for comparison after edits", async () => {
  const { service } = createService();
  const draft = await service.generateDraft({ idea: "Backend engineer" }, ownerAccess);

  const edited = await service.updateDraft(
    draft.id,
    { modules: [{ ...draft.draft.modules[0], title: "Edited title" }] },
    ownerAccess,
  );

  assert.equal(edited.aiProposal.modules.length, 2, "the stored proposal must not follow the edits");
  assert.equal(edited.draft.modules.length, 1);
});

test("an empty module list is rejected instead of publishing an unusable assessment", async () => {
  const { service } = createService();
  const draft = await service.generateDraft({ idea: "Backend engineer" }, ownerAccess);

  await assert.rejects(() => service.updateDraft(draft.id, { modules: [] }, ownerAccess), /at least one module/i);
});

test("drafts are scoped to the owning organization", async () => {
  const { service } = createService();
  const draft = await service.generateDraft({ idea: "Backend engineer" }, ownerAccess);

  await assert.rejects(() => service.getDraft(draft.id, otherOrgAccess), /not found or access denied/i);
  await assert.rejects(() => service.confirmDraft(draft.id, {}, otherOrgAccess), /not found or access denied/i);
  await assert.rejects(() => service.updateDraft(draft.id, { modules: [] }, otherOrgAccess), /not found or access denied/i);

  const visible = await service.listDrafts(otherOrgAccess);
  assert.equal(visible.length, 0);
});

test("candidates cannot reach drafts at all", async () => {
  const { service } = createService();
  const candidateAccess: AccessContext = { userId: "candidate-1", role: "candidate" };

  await assert.rejects(() => service.generateDraft({ idea: "anything" }, candidateAccess), /permission/i);
  await assert.rejects(() => service.listDrafts(candidateAccess), /not found or access denied/i);
});

test("listing returns summaries for the caller's workspace", async () => {
  const { service } = createService();
  await service.generateDraft({ idea: "Backend engineer" }, ownerAccess);

  const [summary] = await service.listDrafts(ownerAccess);

  assert.equal(summary.title, "Backend Engineer Assessment");
  assert.equal(summary.moduleCount, 2);
  assert.equal(summary.questionCount, 2);
  assert.equal(summary.status, "draft");
});

test("a stored draft with corrupted JSON still reads back as a valid draft shape", async () => {
  const prisma = createPrismaStub({
    "draft-legacy": {
      id: "draft-legacy",
      organizationId: "org-1",
      createdById: "user-1",
      status: "DRAFT",
      source: "PROMPT",
      aiProposal: null,
      // Weights that do not total 100 — written before the rule, or edited in the DB.
      draft: { title: "Legacy", roleType: "Analyst", modules: [{ type: "coding", title: "Coding", weight: 12 }] },
      provider: "deepseek",
    },
  });
  const { service } = createService({ prisma });

  const draft = await service.getDraft("draft-legacy", ownerAccess);

  assert.equal(draft.draft.modules.length, 1);
  assert.equal(draft.draft.modules[0].weight, TOTAL_WEIGHT);
});
