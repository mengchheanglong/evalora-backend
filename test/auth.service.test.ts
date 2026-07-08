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

test("register hashes password and signs JWT with role claims", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");

  const result = await service.register({
    name: "Long Mengchheang",
    email: "long@example.com",
    password: "secure-password",
    role: "organization",
  });

  assert.equal(result.user.email, "long@example.com");
  assert.equal(result.user.role, "organization");
  assert.equal("passwordHash" in result.user, false);
  assert.notEqual(repo.users[0].passwordHash, "secure-password");
  assert.equal(await bcrypt.compare("secure-password", repo.users[0].passwordHash), true);

  const decoded = jwt.verify(result.token, "test-jwt-secret") as { sub: string; email: string; role: string };
  assert.equal(decoded.sub, "user-1");
  assert.equal(decoded.email, "long@example.com");
  assert.equal(decoded.role, "organization");
});

test("login verifies hashed password before issuing token", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");
  await service.register({ name: "Demo User", email: "demo@example.com", password: "correct-password", role: "candidate" });

  await assert.rejects(() => service.login({ email: "demo@example.com", password: "wrong-password" }), /invalid email or password/i);

  const result = await service.login({ email: "demo@example.com", password: "correct-password" });
  assert.equal(result.user.role, "candidate");
  assert.equal(typeof result.token, "string");
});
