import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as jwt from "jsonwebtoken";
import {
  assertRoleAccess,
  extractAuthUserFromHeader,
  TOKEN_PURPOSES,
  tryExtractAuthUserFromHeader,
  tryExtractAuthUserFromToken,
} from "../src/modules/auth/auth.guard";

const jwtSecret = "guard-test-secret";
const claims = { sub: "user-1", email: "long@example.com", role: "organization" };

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

test("tryExtractAuthUserFromHeader returns the user for a valid token and null otherwise (no throw)", () => {
  const token = jwt.sign({ sub: "user-1", email: "long@example.com", role: "organization" }, jwtSecret);

  assert.equal(tryExtractAuthUserFromHeader(`Bearer ${token}`, jwtSecret)?.id, "user-1");
  assert.equal(tryExtractAuthUserFromHeader(undefined, jwtSecret), null);
  assert.equal(tryExtractAuthUserFromHeader("Basic abc", jwtSecret), null);
  assert.equal(tryExtractAuthUserFromHeader("Bearer invalid-token", jwtSecret), null);
});

test("REST auth rejects every token that was not issued as a session", () => {
  const ticket = jwt.sign({ ...claims, purpose: TOKEN_PURPOSES.realtimeTicket }, jwtSecret);
  const reset = jwt.sign({ ...claims, purpose: TOKEN_PURPOSES.passwordReset }, jwtSecret);
  const verification = jwt.sign({ ...claims, purpose: TOKEN_PURPOSES.emailVerification }, jwtSecret);

  assert.throws(() => extractAuthUserFromHeader(`Bearer ${ticket}`, jwtSecret), /Authentication required/i);
  assert.throws(() => extractAuthUserFromHeader(`Bearer ${reset}`, jwtSecret), /Authentication required/i);
  assert.equal(tryExtractAuthUserFromHeader(`Bearer ${verification}`, jwtSecret), null);
});

test("REST auth accepts session tokens with and without an explicit purpose claim", () => {
  // Session cookies signed before purposes existed carry no claim; invalidating
  // them would sign every user out on deploy.
  const legacy = jwt.sign(claims, jwtSecret);
  const current = jwt.sign({ ...claims, purpose: TOKEN_PURPOSES.session }, jwtSecret);

  assert.equal(extractAuthUserFromHeader(`Bearer ${legacy}`, jwtSecret).id, "user-1");
  assert.equal(extractAuthUserFromHeader(`Bearer ${current}`, jwtSecret).id, "user-1");
});

test("tryExtractAuthUserFromToken enforces the purpose the caller asks for", () => {
  const ticket = jwt.sign({ ...claims, purpose: TOKEN_PURPOSES.realtimeTicket }, jwtSecret);
  const session = jwt.sign({ ...claims, purpose: TOKEN_PURPOSES.session }, jwtSecret);

  assert.equal(tryExtractAuthUserFromToken(ticket, TOKEN_PURPOSES.realtimeTicket, jwtSecret)?.id, "user-1");
  assert.equal(tryExtractAuthUserFromToken(session, TOKEN_PURPOSES.session, jwtSecret)?.id, "user-1");
  assert.equal(tryExtractAuthUserFromToken(session, TOKEN_PURPOSES.realtimeTicket, jwtSecret), null);
  assert.equal(tryExtractAuthUserFromToken(ticket, TOKEN_PURPOSES.session, jwtSecret), null);
  assert.equal(tryExtractAuthUserFromToken("", TOKEN_PURPOSES.realtimeTicket, jwtSecret), null);
});
