import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import { extractAuthUserFromHeader, TOKEN_PURPOSES, tryExtractAuthUserFromToken } from "../src/modules/auth/auth.guard";
import { AuthService, type AuthUserRecord, type AuthUserRepository, type RegisterInput } from "../src/modules/auth/auth.service";

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
    async updatePasswordHash(userId, passwordHash) {
      const user = users.find((row) => row.id === userId);
      if (!user) throw new Error("User not found.");
      user.passwordHash = passwordHash;
      return user;
    },
    async updateName(userId, name) {
      const user = users.find((row) => row.id === userId);
      if (!user) throw new Error("User not found.");
      user.name = name;
      return user;
    },
    async markEmailVerified(userId) {
      const user = users.find((row) => row.id === userId);
      if (!user) throw new Error("User not found.");
      user.emailVerified = true;
      return user;
    },
  };
}

async function registerAndVerify(service: AuthService, input: RegisterInput) {
  const registration = await service.register(input);
  const token = new URL(registration.verificationUrl ?? "").searchParams.get("token");
  assert.ok(token, "test registration should expose a local verification URL");
  return service.verifyEmail({ token });
}

test("public register creates an unverified owner and verification signs JWT with role claims", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");

  const result = await service.register({
    name: "Long Mengchheang",
    email: "long@example.com",
    password: "SecurePass1",
  });

  assert.equal(result.email, "long@example.com");
  assert.equal(result.requiresEmailVerification, true);
  assert.equal(repo.users[0].emailVerified, false);
  assert.notEqual(repo.users[0].passwordHash, "SecurePass1");
  assert.equal(await bcrypt.compare("SecurePass1", repo.users[0].passwordHash), true);

  const token = new URL(result.verificationUrl ?? "").searchParams.get("token");
  assert.ok(token);
  const verified = await service.verifyEmail({ token });
  assert.equal(verified.user.emailVerified, true);
  const decoded = jwt.verify(verified.token, "test-jwt-secret") as { sub: string; email: string; role: string };
  assert.equal(decoded.sub, "user-1");
  assert.equal(decoded.email, "long@example.com");
  assert.equal(decoded.role, "organization");
});

test("public register does not create admin or candidate platform accounts", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");

  await assert.rejects(
    () => service.register({ name: "Admin", email: "admin@example.com", password: "SecurePass1", role: "admin" }),
    /platform admin accounts are not created/i,
  );
  await assert.rejects(
    () => service.register({ name: "Candidate", email: "candidate@example.com", password: "SecurePass1", role: "candidate" }),
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
      password: "SecurePass1",
      organizationId: "another-tenant",
    }),
    /organization membership cannot be selected/i,
  );
  assert.equal(repo.users.length, 0);
});

test("login verifies hashed password before issuing token", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");
  await registerAndVerify(service, { name: "Demo User", email: "demo@example.com", password: "CorrectPass1", role: "interviewer" });

  await assert.rejects(() => service.login({ email: "demo@example.com", password: "WrongPass1" }), /invalid email or password/i);

  const result = await service.login({ email: "demo@example.com", password: "CorrectPass1" });
  assert.equal(result.user.role, "organization");
  assert.equal(typeof result.token, "string");
});

test("an interviewer can update only their own display name", async () => {
  const repo = createRepo();
  const passwordHash = await bcrypt.hash("SecurePass1", 4);
  repo.users.push({
    id: "interviewer-1",
    name: "Original Name",
    email: "interviewer@example.com",
    emailVerified: true,
    passwordHash,
    role: "interviewer",
    organizationId: "org-1",
  });
  const service = new AuthService(repo, "test-jwt-secret");

  const updated = await service.updateCurrentUser("interviewer-1", { name: "Updated Interviewer" });

  assert.equal(updated.name, "Updated Interviewer");
  assert.equal(repo.users[0].name, "Updated Interviewer");
  assert.equal(updated.organizationId, "org-1");
  assert.equal(updated.role, "interviewer");
});

test("repeated registration resends verification without replacing pending credentials", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");

  await service.register({ name: "Original Owner", email: "pending@example.com", password: "OriginalPass1" });
  const originalHash = repo.users[0].passwordHash;

  const repeated = await service.register({ name: "Different Name", email: "pending@example.com", password: "DifferentPass2" });

  assert.equal(repeated.requiresEmailVerification, true);
  assert.equal(repo.users.length, 1);
  assert.equal(repo.users[0].name, "Original Owner");
  assert.equal(repo.users[0].passwordHash, originalHash);
  assert.equal(await bcrypt.compare("OriginalPass1", repo.users[0].passwordHash), true);
  assert.equal(await bcrypt.compare("DifferentPass2", repo.users[0].passwordHash), false);
});

test("login is blocked until email verification and resend issues a fresh link", async () => {
  const repo = createRepo();
  const sentUrls: string[] = [];
  const emailService = {
    isConfigured: true,
    buildPasswordResetUrl: (token: string) => `https://app.example.com/reset-password?token=${token}`,
    buildEmailVerificationUrl: (token: string) => `https://app.example.com/verify-email?token=${token}`,
    async sendEmailVerification(input: { verificationUrl: string }) {
      sentUrls.push(input.verificationUrl);
      return { status: "sent" as const, provider: "test-mail" };
    },
    async sendPasswordReset() {
      return { status: "sent" as const, provider: "test-mail" };
    },
  };
  const service = new AuthService(repo, "test-jwt-secret", undefined, emailService);

  const registration = await service.register({ name: "Owner", email: "owner@example.com", password: "SecurePass1" });
  assert.equal(registration.emailDelivery.status, "sent");
  await assert.rejects(
    () => service.login({ email: "owner@example.com", password: "SecurePass1" }),
    /verify your email/i,
  );

  const resend = await service.resendEmailVerification({ email: "owner@example.com" });
  assert.equal(resend.emailDelivery.status, "sent");
  assert.equal(sentUrls.length, 2);

  const token = new URL(sentUrls[1]).searchParams.get("token");
  assert.ok(token);
  const verified = await service.verifyEmail({ token });
  assert.equal(verified.user.emailVerified, true);
});

test("remembered login issues a 30-day token while regular login stays at one day", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");
  await registerAndVerify(service, { name: "Demo User", email: "demo@example.com", password: "CorrectPass1" });

  const regular = await service.login({ email: "demo@example.com", password: "CorrectPass1" });
  const remembered = await service.login({ email: "demo@example.com", password: "CorrectPass1", remember: true });
  const regularClaims = jwt.verify(regular.token, "test-jwt-secret") as jwt.JwtPayload;
  const rememberedClaims = jwt.verify(remembered.token, "test-jwt-secret") as jwt.JwtPayload;

  assert.equal((regularClaims.exp ?? 0) - (regularClaims.iat ?? 0), 60 * 60 * 24);
  assert.equal((rememberedClaims.exp ?? 0) - (rememberedClaims.iat ?? 0), 60 * 60 * 24 * 30);
});

test("register rejects passwords missing uppercase, lowercase, or a number", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");

  await assert.rejects(
    () => service.register({ name: "Weak", email: "weak1@example.com", password: "alllowercase1" }),
    /uppercase/i,
  );
  await assert.rejects(
    () => service.register({ name: "Weak", email: "weak2@example.com", password: "ALLUPPERCASE1" }),
    /lowercase/i,
  );
  await assert.rejects(
    () => service.register({ name: "Weak", email: "weak3@example.com", password: "NoNumberHere" }),
    /number/i,
  );
  await assert.rejects(
    () => service.register({ name: "Weak", email: "weak4@example.com", password: "Ab1" }),
    /at least 8 characters/i,
  );
  assert.equal(repo.users.length, 0);
});

test("login blocks invite-only candidate records even with a valid password", async () => {
  const repo = createRepo();
  const passwordHash = await bcrypt.hash("candidate-password", 4);
  repo.users.push({
    id: "candidate-1",
    name: "Invite Candidate",
    email: "candidate@example.com",
    emailVerified: true,
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

test("Google sign-in verifies and logs in an existing workspace user", async () => {
  const repo = createRepo();
  repo.users.push({
    id: "owner-1",
    name: "Existing Owner",
    email: "owner@example.com",
    emailVerified: false,
    passwordHash: await bcrypt.hash("secure-password", 4),
    role: "organization",
    organizationId: "org-1",
  });
  const service = new AuthService(repo, "test-jwt-secret", {
    async verify() {
      return { email: "owner@example.com", name: "Existing Owner", emailVerified: true };
    },
  });

  const result = await service.loginWithGoogle({ credential: "fake-token", remember: true });
  assert.equal(result.user.id, "owner-1");
  assert.equal(result.user.emailVerified, true);
  assert.equal(result.user.organizationId, "org-1");
  assert.equal(repo.users.length, 1);
  const claims = jwt.verify(result.token, "test-jwt-secret") as jwt.JwtPayload;
  assert.equal((claims.exp ?? 0) - (claims.iat ?? 0), 60 * 60 * 24 * 30);
});

test("Google sign-in rejects candidate emails and unverified accounts", async () => {
  const repo = createRepo();
  repo.users.push({
    id: "cand-1",
    name: "Candidate",
    email: "candidate-google@example.com",
    emailVerified: true,
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

test("forgot password returns generic message and reset link when email is skipped", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");
  await registerAndVerify(service, { name: "Owner", email: "owner@example.com", password: "OldPassword1" });

  const unknown = await service.requestPasswordReset({ email: "missing@example.com" });
  assert.match(unknown.message, /if an account exists/i);
  assert.equal(unknown.resetUrl, undefined);

  const known = await service.requestPasswordReset({ email: "owner@example.com" });
  assert.match(known.message, /if an account exists/i);
  assert.equal(typeof known.resetUrl, "string");
  assert.match(known.resetUrl ?? "", /reset-password\?token=/);
});

test("forgot password does not reveal whether an account exists when email delivery is configured", async () => {
  const repo = createRepo();
  const sent: Array<{ to: string }> = [];
  const emailService = {
    isConfigured: true,
    buildPasswordResetUrl: (token: string) => `https://app.example.com/reset-password?token=${token}`,
    async sendPasswordReset(input: { to: string; userName: string; resetUrl: string; expiresInLabel: string }) {
      sent.push({ to: input.to });
      return { status: "sent" as const, provider: "test-mail" };
    },
  };
  const service = new AuthService(repo, "test-jwt-secret", undefined, emailService);
  await registerAndVerify(service, { name: "Owner", email: "owner@example.com", password: "OldPassword1" });

  const known = await service.requestPasswordReset({ email: "owner@example.com" });
  const unknown = await service.requestPasswordReset({ email: "missing@example.com" });

  // Both responses must be indistinguishable to a caller: same message and a
  // byte-for-byte identical emailDelivery (no provider name, no send reason, no
  // leaked reset link) — otherwise the endpoint is an oracle for which emails
  // have accounts.
  assert.equal(known.message, unknown.message);
  assert.equal(known.emailDelivery.status, "sent");
  assert.deepEqual(known.emailDelivery, unknown.emailDelivery);
  assert.doesNotMatch(unknown.emailDelivery.reason ?? "", /no matching|not found|no account|workspace account/i);
  assert.equal(known.resetUrl, undefined);
  assert.equal(unknown.resetUrl, undefined);

  // Only the real account triggers an email (and a token); the unknown one must not.
  assert.deepEqual(sent, [{ to: "owner@example.com" }]);
});

test("reset password updates hash and invalidates the previous token", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");
  await registerAndVerify(service, { name: "Owner", email: "owner@example.com", password: "OldPassword1" });

  const request = await service.requestPasswordReset({ email: "owner@example.com" });
  const token = new URL(request.resetUrl ?? "").searchParams.get("token");
  assert.ok(token);

  const result = await service.resetPassword({ token: token!, password: "NewPassword9" });
  assert.match(result.message, /password updated/i);

  await assert.rejects(() => service.login({ email: "owner@example.com", password: "OldPassword1" }), /invalid email or password/i);
  const login = await service.login({ email: "owner@example.com", password: "NewPassword9" });
  assert.equal(login.user.email, "owner@example.com");

  await assert.rejects(() => service.resetPassword({ token: token!, password: "AnotherPass1" }), /invalid or has expired/i);
});

test("reset password rejects weak replacement passwords", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");
  await registerAndVerify(service, { name: "Owner", email: "owner@example.com", password: "OldPassword1" });
  const request = await service.requestPasswordReset({ email: "owner@example.com" });
  const token = new URL(request.resetUrl ?? "").searchParams.get("token");
  assert.ok(token);

  await assert.rejects(() => service.resetPassword({ token: token!, password: "weakpass1" }), /uppercase/i);
  await assert.rejects(() => service.resetPassword({ token: token!, password: "WEAKPASS1" }), /lowercase/i);
  await assert.rejects(() => service.resetPassword({ token: token!, password: "WeakPassword" }), /number/i);
});

test("register rejects a malformed email address", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");

  await assert.rejects(
    () => service.register({ name: "No At Sign", email: "not-an-email", password: "SecurePass1" }),
    /valid email/i,
  );
  await assert.rejects(
    () => service.register({ name: "Spaces", email: "a b@example.com", password: "SecurePass1" }),
    /valid email/i,
  );
  assert.equal(repo.users.length, 0);
});

test("register rejects an over-long name and email", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");

  await assert.rejects(
    () => service.register({ name: "x".repeat(201), email: "long@example.com", password: "SecurePass1" }),
    /longer than allowed/i,
  );
  await assert.rejects(
    () => service.register({ name: "Fine", email: `${"a".repeat(320)}@example.com`, password: "SecurePass1" }),
    /longer than allowed/i,
  );
  assert.equal(repo.users.length, 0);
});

test("a realtime ticket opens the socket but is not a REST credential", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");
  await registerAndVerify(service, { name: "Owner", email: "owner@example.com", password: "SecurePass1" });
  const session = await service.login({ email: "owner@example.com", password: "SecurePass1" });

  const { ticket } = service.issueRealtimeTicket(session.user);

  // The ticket is handed to browser JavaScript, so it must be useless anywhere
  // except the handshake it was minted for.
  assert.equal(tryExtractAuthUserFromToken(ticket, TOKEN_PURPOSES.realtimeTicket, "test-jwt-secret")?.id, session.user.id);
  assert.throws(() => extractAuthUserFromHeader(`Bearer ${ticket}`, "test-jwt-secret"), /Authentication required/i);
  // The session token keeps working over REST, and cannot stand in for a ticket.
  assert.equal(extractAuthUserFromHeader(`Bearer ${session.token}`, "test-jwt-secret").id, session.user.id);
  assert.equal(tryExtractAuthUserFromToken(session.token, TOKEN_PURPOSES.realtimeTicket, "test-jwt-secret"), null);
});

test("login returns the same generic error for a missing account and a wrong password", async () => {
  const repo = createRepo();
  const service = new AuthService(repo, "test-jwt-secret");
  await registerAndVerify(service, { name: "Real User", email: "real@example.com", password: "SecurePass1" });

  await assert.rejects(
    () => service.login({ email: "real@example.com", password: "WrongPass1" }),
    /invalid email or password/i,
  );
  await assert.rejects(
    () => service.login({ email: "ghost@example.com", password: "AnyPass123" }),
    /invalid email or password/i,
  );
});
