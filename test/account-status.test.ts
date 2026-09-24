import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import {
  ACCOUNT_STATUS_SELECT,
  ACCOUNT_SUSPENDED_MESSAGE,
  WORKSPACE_SUSPENDED_MESSAGE,
  assertAccountActive,
  resolveActiveUser,
  type AccountStatusRow,
} from "../src/modules/auth/account-status";
import { JwtAuthGuard } from "../src/modules/auth/auth.guard";
import {
  AccountSuspendedError,
  AuthService,
  type AuthUserRecord,
  type AuthUserRepository,
} from "../src/modules/auth/auth.service";

process.env.JWT_SECRET ??= "account-status-test-secret";
const jwtSecret = process.env.JWT_SECRET;

const tokenUser = { id: "user-1", email: "stale@example.com", role: "interviewer" as const, organizationId: "org-old" };
const activeOwner: AccountStatusRow = {
  id: "user-1",
  email: "owner@example.com",
  role: "ORGANIZATION",
  organizationId: "org-1",
  isSuspended: false,
  organization: { isSuspended: false },
};

function fakeClient(rows: AccountStatusRow[]) {
  const calls: Array<{ where: { id: string }; select: unknown }> = [];
  return {
    calls,
    user: {
      async findUnique(args: { where: { id: string }; select: typeof ACCOUNT_STATUS_SELECT }) {
        calls.push(args);
        return rows.find((row) => row.id === args.where.id) ?? null;
      },
    },
  };
}

test("resolveActiveUser trusts the database over the token for role and workspace", async () => {
  const client = fakeClient([activeOwner]);

  const user = await resolveActiveUser(client, tokenUser);

  assert.deepEqual(user, { id: "user-1", email: "owner@example.com", role: "organization", organizationId: "org-1" });
  assert.deepEqual(client.calls[0].select, ACCOUNT_STATUS_SELECT);
});

test("resolveActiveUser rejects a suspended account with the suspension message", async () => {
  const client = fakeClient([{ ...activeOwner, isSuspended: true }]);

  await assert.rejects(resolveActiveUser(client, tokenUser), (error: unknown) => {
    assert.ok(error instanceof ForbiddenException);
    assert.equal(error.message, ACCOUNT_SUSPENDED_MESSAGE);
    return true;
  });
});

test("a suspended workspace blocks its members but never a platform admin", () => {
  const suspendedWorkspace = { isSuspended: true };

  assert.throws(
    () => assertAccountActive({ role: "INTERVIEWER", isSuspended: false, organization: suspendedWorkspace }),
    (error: unknown) => error instanceof ForbiddenException && error.message === WORKSPACE_SUSPENDED_MESSAGE,
  );
  assert.throws(
    () => assertAccountActive({ role: "organization", workspaceSuspended: true }),
    (error: unknown) => error instanceof ForbiddenException && error.message === WORKSPACE_SUSPENDED_MESSAGE,
  );
  assert.doesNotThrow(() => assertAccountActive({ role: "ADMIN", isSuspended: false, organization: suspendedWorkspace }));
  assert.doesNotThrow(() => assertAccountActive({ role: "admin", workspaceSuspended: true }));
  // An admin's own suspension still counts.
  assert.throws(() => assertAccountActive({ role: "ADMIN", isSuspended: true }), ForbiddenException);
});

test("a token for a deleted account is unauthenticated, not a ghost with old claims", async () => {
  await assert.rejects(resolveActiveUser(fakeClient([]), tokenUser), UnauthorizedException);
});

test("JwtAuthGuard re-reads the account on every request so a suspension bites immediately", async () => {
  const rows: AccountStatusRow[] = [{ ...activeOwner }];
  const client = fakeClient(rows);
  const guard = new JwtAuthGuard(client as never);
  const token = jwt.sign({ sub: "user-1", email: "owner@example.com", role: "organization", organizationId: "org-1" }, jwtSecret);
  const request: { headers: { authorization: string }; user?: unknown } = { headers: { authorization: `Bearer ${token}` } };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as never;

  assert.equal(await guard.canActivate(context), true);
  assert.deepEqual(request.user, { id: "user-1", email: "owner@example.com", role: "organization", organizationId: "org-1" });

  rows[0].isSuspended = true;
  await assert.rejects(guard.canActivate(context), (error: unknown) => {
    assert.ok(error instanceof ForbiddenException);
    assert.equal(error.message, ACCOUNT_SUSPENDED_MESSAGE);
    return true;
  });
  assert.equal(client.calls.length, 2);
});

test("JwtAuthGuard still rejects a missing or malformed token before touching the database", async () => {
  const client = fakeClient([activeOwner]);
  const guard = new JwtAuthGuard(client as never);
  const context = { switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }) } as never;

  await assert.rejects(guard.canActivate(context), UnauthorizedException);
  assert.equal(client.calls.length, 0);
});

function repoWith(users: AuthUserRecord[]): AuthUserRepository {
  return {
    async findByEmail(email) {
      return users.find((user) => user.email === email) ?? null;
    },
    async findById(id) {
      return users.find((user) => user.id === id) ?? null;
    },
    async createUser(data) {
      const user = { id: `user-${users.length + 1}`, ...data };
      users.push(user);
      return user;
    },
  };
}

test("login and session refresh refuse suspended accounts with a distinct error", async () => {
  const passwordHash = await bcrypt.hash("SecurePass1", 4);
  const base = { emailVerified: true, passwordHash };
  const service = new AuthService(
    repoWith([
      { id: "u-suspended", name: "Sam", email: "suspended@example.com", role: "organization", organizationId: "org-1", isSuspended: true, ...base },
      { id: "u-member", name: "Mia", email: "member@example.com", role: "interviewer", organizationId: "org-2", workspaceSuspended: true, ...base },
      { id: "u-admin", name: "Ada", email: "admin@example.com", role: "admin", organizationId: "org-2", workspaceSuspended: true, ...base },
    ]),
    jwtSecret,
  );

  await assert.rejects(service.login({ email: "suspended@example.com", password: "SecurePass1" }), (error: unknown) => {
    assert.ok(error instanceof AccountSuspendedError);
    assert.equal(error.message, ACCOUNT_SUSPENDED_MESSAGE);
    return true;
  });
  await assert.rejects(service.login({ email: "member@example.com", password: "SecurePass1" }), (error: unknown) => {
    assert.ok(error instanceof AccountSuspendedError);
    assert.equal(error.message, WORKSPACE_SUSPENDED_MESSAGE);
    return true;
  });
  // Wrong password still reads as bad credentials, never as a suspension hint.
  await assert.rejects(service.login({ email: "suspended@example.com", password: "WrongPass1" }), /Invalid email or password/);

  const admin = await service.login({ email: "admin@example.com", password: "SecurePass1" });
  assert.equal(admin.user.role, "admin");
  assert.equal("isSuspended" in admin.user, false);

  await assert.rejects(service.getCurrentUser("u-suspended"), AccountSuspendedError);
  await assert.rejects(service.getCurrentUser("u-member"), AccountSuspendedError);
  assert.equal((await service.getCurrentUser("u-admin")).id, "u-admin");
});
