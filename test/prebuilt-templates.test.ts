import { test } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PREBUILT_ASSESSMENT_TEMPLATES, buildPrebuiltTemplateCreateData, buildPrebuiltTemplateUpdateData } from "../src/modules/templates/prebuilt-templates";

test("prebuilt template definitions are split into per-role module files", () => {
  const expectedModuleFiles = [
    "customer-success/index.ts",
    "data-analyst/index.ts",
    "frontend-developer/index.ts",
    "hr-generalist/ai-ethics.ts",
    "hr-generalist/behavioral.ts",
    "hr-generalist/communication.ts",
    "hr-generalist/index.ts",
    "hr-generalist/leadership.ts",
    "hr-generalist/problem-solving.ts",
    "hr-generalist/work-style.ts",
    "product-manager/index.ts",
    "software-engineer/ai-interview.ts",
    "software-engineer/behavioral.ts",
    "software-engineer/coding.ts",
    "software-engineer/communication.ts",
    "software-engineer/debugging.ts",
    "software-engineer/index.ts",
    "software-engineer/system-design.ts",
    "software-engineer/work-style.ts",
    "team-leader/ai-interview.ts",
    "team-leader/behavioral.ts",
    "team-leader/communication.ts",
    "team-leader/index.ts",
    "team-leader/leadership.ts",
    "team-leader/problem-solving.ts",
    "team-leader/work-style.ts",
    "index.ts",
    "seed-mappers.ts",
    "types.ts",
  ];

  for (const relativePath of expectedModuleFiles) {
    assert.ok(
      existsSync(join(process.cwd(), "src/modules/templates/prebuilt", relativePath)),
      `${relativePath} should exist under src/modules/templates/prebuilt`,
    );
  }
});

function templateByRole(roleType: string) {
  const template = PREBUILT_ASSESSMENT_TEMPLATES.find((item) => item.roleType === roleType);
  assert.ok(template, `${roleType} template should exist`);
  return template;
}

test("prebuilt templates cover core hiring roles across the catalog", () => {
  assert.deepEqual(
    PREBUILT_ASSESSMENT_TEMPLATES.map((template) => template.roleType).sort(),
    [
      "Customer Success",
      "Data Analyst",
      "Frontend Developer",
      "HR Generalist",
      "Product Manager",
      "Software Engineer",
      "Team Leader",
    ],
  );

  const allQuestionIds = new Set<string>();
  for (const template of PREBUILT_ASSESSMENT_TEMPLATES) {
    assert.match(template.id, /^prebuilt-/);
    assert.ok(template.title.includes("Assessment"));
    assert.ok((template.timeLimitMin ?? 0) >= 45);
    assert.ok(template.modules.length >= 5, `${template.title} should have a production-sized module set`);
    const scoring = template.scoringRules as { source?: string; recommendedCandidateQuestionCount?: unknown };
    assert.equal(scoring.source, "prebuilt-researched-v2");
    assert.ok(scoring.recommendedCandidateQuestionCount, `${template.title} should define candidate subset size`);

    for (const module of template.modules) {
      assert.ok(module.questions.length >= 3, `${module.title} should include a meaningful question bank`);
      for (const question of module.questions) {
        assert.ok(question.id.startsWith("prebuilt-"));
        assert.ok(!allQuestionIds.has(question.id), `${question.id} should be unique`);
        allQuestionIds.add(question.id);
        assert.ok(question.questionText.length > 20);
        assert.ok(Array.isArray(question.rubric));
        assert.ok(question.rubric.length >= 3, `${question.questionText} should include a useful rubric`);
      }
    }
  }
});

test("prebuilt templates include researched question-bank depth and candidate subset sizing", () => {
  const hr = templateByRole("HR Generalist");
  assert.ok(hr.modules.flatMap((module) => module.questions).length >= 25);
  assert.deepEqual((hr.scoringRules as { recommendedCandidateQuestionCount: unknown }).recommendedCandidateQuestionCount, {
    min: 10,
    max: 14,
  });

  const software = templateByRole("Software Engineer");
  assert.ok(software.modules.flatMap((module) => module.questions).length >= 35);
  assert.deepEqual((software.scoringRules as { recommendedCandidateQuestionCount: unknown }).recommendedCandidateQuestionCount, {
    min: 10,
    max: 15,
    practicalTasks: 1,
  });

  const leader = templateByRole("Team Leader");
  assert.ok(leader.modules.flatMap((module) => module.questions).length >= 25);
  assert.deepEqual((leader.scoringRules as { recommendedCandidateQuestionCount: unknown }).recommendedCandidateQuestionCount, {
    min: 10,
    max: 14,
  });

  for (const role of ["Product Manager", "Frontend Developer", "Data Analyst", "Customer Success"]) {
    const template = templateByRole(role);
    assert.ok(template.modules.flatMap((module) => module.questions).length >= 18, `${role} should have a solid question bank`);
  }
});

test("prebuilt rubrics remain scorer-compatible concepts rather than prose instructions", () => {
  const instructionWords = /\b(describe|explain|discuss|mention|provide|show|demonstrate|include|outline)\b/i;

  for (const template of PREBUILT_ASSESSMENT_TEMPLATES) {
    for (const module of template.modules) {
      for (const question of module.questions) {
        for (const criterion of question.rubric) {
          const words = criterion.trim().split(/\s+/);
          assert.ok(
            words.length <= 4,
            `${question.id} rubric criterion should be a compact concept: "${criterion}"`,
          );
          assert.doesNotMatch(
            criterion,
            instructionWords,
            `${question.id} rubric criterion must not require a literal instruction verb`,
          );
        }
      }
    }
  }
});

test("prebuilt templates include the expected role/module coverage", () => {
  assert.deepEqual(
    templateByRole("HR Generalist").modules.map((module) => module.type),
    ["behavioral", "communication", "work_style", "problem_solving", "leadership", "ai_interview"],
  );
  assert.deepEqual(
    templateByRole("Software Engineer").modules.map((module) => module.type),
    ["ai_interview", "coding", "debugging", "problem_solving", "communication", "work_style", "behavioral"],
  );
  assert.deepEqual(
    templateByRole("Team Leader").modules.map((module) => module.type),
    ["leadership", "communication", "behavioral", "problem_solving", "work_style", "ai_interview"],
  );
  assert.deepEqual(
    templateByRole("Product Manager").modules.map((module) => module.type),
    ["problem_solving", "communication", "leadership", "behavioral", "work_style", "ai_interview"],
  );
  assert.deepEqual(
    templateByRole("Frontend Developer").modules.map((module) => module.type),
    ["coding", "debugging", "ai_interview", "communication", "behavioral", "work_style"],
  );
  assert.deepEqual(
    templateByRole("Data Analyst").modules.map((module) => module.type),
    ["problem_solving", "communication", "behavioral", "work_style", "leadership", "ai_interview"],
  );
  assert.deepEqual(
    templateByRole("Customer Success").modules.map((module) => module.type),
    ["communication", "problem_solving", "behavioral", "leadership", "work_style", "ai_interview"],
  );
});

test("prebuilt template seed helpers map API module/question types into Prisma values", () => {
  const software = templateByRole("Software Engineer");
  const createData = buildPrebuiltTemplateCreateData(software, {
    createdById: "seed-user",
    organizationId: "seed-org",
  });

  assert.equal(createData.id, "prebuilt-software-engineer-assessment");
  assert.equal(createData.createdById, "seed-user");
  assert.equal(createData.organizationId, "seed-org");
  assert.equal(createData.modules.create[1].moduleType, "CODING");
  assert.equal(createData.modules.create[1].questions.create[0].questionType, "CODING");
  assert.deepEqual(createData.modules.create[1].questions.create[0].rubric, ["correctness", "edge cases", "readability", "complexity", "test coverage"]);

  const updateData = buildPrebuiltTemplateUpdateData(software, {
    createdById: "seed-user",
    organizationId: "seed-org",
  });
  assert.deepEqual(updateData.modules.deleteMany, {});
  assert.equal(updateData.modules.create[2].moduleType, "DEBUGGING");
});
