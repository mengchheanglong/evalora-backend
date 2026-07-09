import "reflect-metadata";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { ROLES_KEY } from "../src/modules/auth/auth.guard";
import { CandidateResponsesAccessController, ResponsesController } from "../src/modules/responses/responses.controller";

function rolesFor(methodName: keyof ResponsesController): string[] {
  return Reflect.getMetadata(ROLES_KEY, ResponsesController.prototype[methodName]) ?? [];
}

test("platform response routes exclude candidate JWT role", () => {
  assert.deepEqual(rolesFor("submit"), ["admin", "organization", "interviewer"]);
  assert.deepEqual(rolesFor("findBySession"), ["admin", "organization", "interviewer"]);
});

test("candidate response access routes stay invite-code public", () => {
  assert.equal(Reflect.getMetadata(ROLES_KEY, CandidateResponsesAccessController.prototype.submitByAccessCode), undefined);
  assert.equal(Reflect.getMetadata(ROLES_KEY, CandidateResponsesAccessController.prototype.findByAccessCode), undefined);
});
