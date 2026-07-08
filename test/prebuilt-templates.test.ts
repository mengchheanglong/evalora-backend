import { test } from "node:test";
import { strict as assert } from "node:assert";
import { PREBUILT_ASSESSMENT_TEMPLATES, buildPrebuiltTemplateCreateData, buildPrebuiltTemplateUpdateData } from "../src/modules/templates/prebuilt-templates";

function templateByRole(roleType: string) {
  const template = PREBUILT_ASSESSMENT_TEMPLATES.find((item) => item.roleType === roleType);
  assert.ok(template, `${roleType} template should exist`);
  return template;
}

test("prebuilt templates cover HR, software engineer, and team leader assessments", () => {
  assert.deepEqual(
    PREBUILT_ASSESSMENT_TEMPLATES.map((template) => template.roleType).sort(),
    ["HR Generalist", "Software Engineer", "Team Leader"],
  );

  for (const template of PREBUILT_ASSESSMENT_TEMPLATES) {
    assert.match(template.id, /^prebuilt-/);
    assert.ok(template.title.includes("Assessment"));
    assert.ok((template.timeLimitMin ?? 0) >= 45);
    assert.ok(template.modules.length >= 4, `${template.title} should have several modules`);

    for (const module of template.modules) {
      assert.ok(module.questions.length >= 1, `${module.title} should include questions`);
      for (const question of module.questions) {
        assert.ok(question.questionText.length > 20);
        assert.ok(Array.isArray(question.rubric));
        assert.ok(question.rubric.length >= 3, `${question.questionText} should include a useful rubric`);
      }
    }
  }
});

test("prebuilt templates include the expected role/module coverage", () => {
  assert.deepEqual(
    templateByRole("HR Generalist").modules.map((module) => module.type),
    ["behavioral", "communication", "work_style", "problem_solving"],
  );
  assert.deepEqual(
    templateByRole("Software Engineer").modules.map((module) => module.type),
    ["ai_interview", "coding", "debugging", "communication"],
  );
  assert.deepEqual(
    templateByRole("Team Leader").modules.map((module) => module.type),
    ["leadership", "communication", "behavioral", "problem_solving"],
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
