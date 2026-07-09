import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import { AuthService, type AuthUserRecord, type AuthUserRepository } from "../src/modules/auth/auth.service";

function createRepo(): AuthUserRepository & { users: AuthUserRecord[] } {
  const users: AuthUserRecord[] = [];

  return {
    users,
    async findByEmail(email: string) {
      return users.find((user) => user.email === email) ?? null;
    },
    async createUser(data) {
      const user = { id: `user-${users.length + 1}`, ...data };
      users.push(user);
      return user;
    },
  };
}

test("public register creates an interviewer account and signs JWT with role claims", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");

  const result = await service.register({
    name: "Long Mengchheang",
    email: "long@example.com",
    password: "secure-password",
  });

  assert.equal(result.user.email, "long@example.com");
  assert.equal(result.user.role, "interviewer");
  assert.equal("passwordHash" in result.user, false);
  assert.notEqual(repo.users[0].passwordHash, "secure-password");
  assert.equal(await bcrypt.compare("secure-password", repo.users[0].passwordHash), true);

  const decoded = jwt.verify(result.token, "test-jwt-secret") as { sub: string; email: string; role: string };
  assert.equal(decoded.sub, "user-1");
  assert.equal(decoded.email, "long@example.com");
  assert.equal(decoded.role, "interviewer");
});

test("public register does not create admin or candidate platform accounts", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");

  await assert.rejects(
    () => service.register({ name: "Admin", email: "admin@example.com", password: "secure-password", role: "admin" }),
    /admin accounts are created privately/i,
  );
  await assert.rejects(
    () => service.register({ name: "Candidate", email: "candidate@example.com", password: "secure-password", role: "candidate" }),
    /candidates access assessments through invitation links/i,
  );

  assert.equal(repo.users.length, 0);
});

test("login verifies hashed password before issuing token", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");
  await service.register({ name: "Demo User", email: "demo@example.com", password: "correct-password", role: "interviewer" });

  await assert.rejects(() => service.login({ email: "demo@example.com", password: "wrong-password" }), /invalid email or password/i);

  const result = await service.login({ email: "demo@example.com", password: "correct-password" });
  assert.equal(result.user.role, "interviewer");
  assert.equal(typeof result.token, "string");
});

test("login blocks invite-only candidate records even with a valid password", async () => {
  const repo = createRepo();
  const passwordHash = await bcrypt.hash("candidate-password", 4);
  repo.users.push({
    id: "candidate-1",
    name: "Invite Candidate",
    email: "candidate@example.com",
    passwordHash,
    role: "candidate",
  });
  const service = new AuthService(repo, "test-jwt-secret");

  await assert.rejects(
    () => service.login({ email: "candidate@example.com", password: "candidate-password" }),
    /invitation link or access code/i,
  );
});
