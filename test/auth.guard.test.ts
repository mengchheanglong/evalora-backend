import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as jwt from "jsonwebtoken";
import { assertRoleAccess, extractAuthUserFromHeader } from "../src/modules/auth/auth.guard";

const jwtSecret = "guard-test-secret";

test("extractAuthUserFromHeader verifies Bearer JWT and returns role claims", () => {
  const token = jwt.sign({ sub: "user-1", email: "long@example.com", role: "organization" }, jwtSecret);

  const user = extractAuthUserFromHeader(`Bearer ${token}`, jwtSecret);

  assert.deepEqual(user, {
    id: "user-1",
    email: "long@example.com",
    role: "organization",
  });
});

test("extractAuthUserFromHeader rejects missing, malformed, and invalid tokens", () => {
  assert.throws(() => extractAuthUserFromHeader(undefined, jwtSecret), /Authentication required/i);
  assert.throws(() => extractAuthUserFromHeader("Basic abc", jwtSecret), /Authentication required/i);
  assert.throws(() => extractAuthUserFromHeader("Bearer invalid-token", jwtSecret), /Authentication required/i);
});

test("assertRoleAccess allows matching roles and rejects unauthorized roles", () => {
  const user = { id: "user-1", email: "long@example.com", role: "interviewer" as const };

  assert.doesNotThrow(() => assertRoleAccess(user, ["organization", "interviewer"]));
  assert.throws(() => assertRoleAccess(user, ["admin"]), /permission/i);
});
