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
    async findById(id: string) {
      return users.find((user) => user.id === id) ?? null;
    },
    async createUser(data) {
      const user = { id: `user-${users.length + 1}`, ...data };
      users.push(user);
      return user;
    },
    async createUserWithWorkspace(data, workspaceName) {
      const user = {
        id: `user-${users.length + 1}`,
        ...data,
        organizationId: `org-${workspaceName.replace(/\s+/g, "-").toLowerCase()}`,
      };
      users.push(user);
      return user;
    },
    async ensureUserWorkspace(user, workspaceName) {
      if (user.organizationId) return user;
      user.organizationId = `org-${workspaceName.replace(/\s+/g, "-").toLowerCase()}`;
      return user;
    },
  };
}

test("public register creates a workspace owner account and signs JWT with role claims", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");

  const result = await service.register({
    name: "Long Mengchheang",
    email: "long@example.com",
    password: "secure-password",
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

test("public register does not create admin or candidate platform accounts", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");

  await assert.rejects(
    () => service.register({ name: "Admin", email: "admin@example.com", password: "secure-password", role: "admin" }),
    /platform admin accounts are not created/i,
  );
  await assert.rejects(
    () => service.register({ name: "Candidate", email: "candidate@example.com", password: "secure-password", role: "candidate" }),
    /candidates access assessments through invitation links/i,
  );

  assert.equal(repo.users.length, 0);
});

test("public register cannot join an existing organization by supplying its id", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");

  await assert.rejects(
    () => service.register({
      name: "Unauthorized Member",
      email: "outsider@example.com",
      password: "secure-password",
      organizationId: "another-tenant",
    }),
    /organization membership cannot be selected/i,
  );
  assert.equal(repo.users.length, 0);
});

test("login verifies hashed password before issuing token", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");
  await service.register({ name: "Demo User", email: "demo@example.com", password: "correct-password", role: "interviewer" });

  await assert.rejects(() => service.login({ email: "demo@example.com", password: "wrong-password" }), /invalid email or password/i);

  const result = await service.login({ email: "demo@example.com", password: "correct-password" });
  assert.equal(result.user.role, "organization");
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

test("Google sign-in creates a workspace owner for a new verified email", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret", {
    async verify() {
      return { email: "new.google@example.com", name: "Google Owner", emailVerified: true };
    },
  });

  const result = await service.loginWithGoogle({ credential: "fake-token", organizationName: "Acme Hiring" });
  assert.equal(result.user.email, "new.google@example.com");
  assert.equal(result.user.role, "organization");
  assert.equal(result.user.organizationId, "org-acme-hiring");
  assert.equal(typeof result.token, "string");
});

test("Google sign-in logs in an existing workspace user", async () => {
  const repo = createRepo();
  repo.users.push({
    id: "owner-1",
    name: "Existing Owner",
    email: "owner@example.com",
    passwordHash: await bcrypt.hash("secure-password", 4),
    role: "organization",
    organizationId: "org-1",
  });
  const service = new AuthService(repo, "test-jwt-secret", {
    async verify() {
      return { email: "owner@example.com", name: "Existing Owner", emailVerified: true };
    },
  });

  const result = await service.loginWithGoogle({ credential: "fake-token" });
  assert.equal(result.user.id, "owner-1");
  assert.equal(result.user.organizationId, "org-1");
  assert.equal(repo.users.length, 1);
});

test("Google sign-in rejects candidate emails and unverified accounts", async () => {
  const repo = createRepo();
  repo.users.push({
    id: "cand-1",
    name: "Candidate",
    email: "candidate-google@example.com",
    passwordHash: "hash",
    role: "candidate",
  });

  const candidateService = new AuthService(repo, "test-jwt-secret", {
    async verify() {
      return { email: "candidate-google@example.com", name: "Candidate", emailVerified: true };
    },
  });
  await assert.rejects(() => candidateService.loginWithGoogle({ credential: "tok" }), /candidate invitation/i);

  const unverified = new AuthService(repo, "test-jwt-secret", {
    async verify() {
      return { email: "unverified@example.com", name: "Nope", emailVerified: false };
    },
  });
  await assert.rejects(() => unverified.loginWithGoogle({ credential: "tok" }), /not verified/i);

  const unconfigured = new AuthService(repo, "test-jwt-secret", null);
  await assert.rejects(() => unconfigured.loginWithGoogle({ credential: "tok" }), /not configured/i);
});
