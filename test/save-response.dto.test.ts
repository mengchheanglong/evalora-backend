import { strict as assert } from "node:assert";
import { test } from "node:test";
import { validateSync } from "class-validator";
import { SaveResponseDto } from "../src/modules/responses/dto/save-response.dto";

function validate(input: Record<string, unknown>) {
  return validateSync(Object.assign(new SaveResponseDto(), input));
}

test("candidate response validation rejects a private question snapshot", () => {
  const errors = validate({
    questionId: "question-1",
    responseText: "My answer",
    responseJson: {
      questionSnapshot: {
        questionText: "Candidate supplied wording",
        rubric: ["candidate supplied rubric"],
      },
    },
  });

  assert.equal(errors.length, 1);
  assert.match(Object.values(errors[0].constraints ?? {}).join(" "), /private fields/i);
});

test("candidate response validation accepts only the public AI follow-up shape", () => {
  assert.deepEqual(validate({
    questionId: "question-1",
    responseText: "My answer",
    responseJson: {
      aiFollowUp: {
        question: "What changed after the rollout?",
        answer: "Error rates fell by 30 percent.",
      },
    },
  }), []);

  assert.equal(validate({
    responseJson: {
      aiFollowUp: {
        question: "What changed?",
        answer: "The result improved.",
        rubric: ["impact"],
      },
    },
  }).length, 1);
});
