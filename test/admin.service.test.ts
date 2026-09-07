import "reflect-metadata";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminController } from "../src/modules/admin/admin.controller";
import {
  ADMIN_MESSAGES,
  AdminService,
  DEFAULT_AI_COST_PER_TURN_USD,
  readAiCostPerTurnFromEnv,
} from "../src/modules/admin/admin.service";
import { JwtAuthGuard, RolesGuard } from "../src/modules/auth/auth.guard";

type Role = "ADMIN" | "ORGANIZATION" | "INTERVIEWER" | "CANDIDATE";
type Plan = "FREE" | "PRO" | "ENTERPRISE";

interface OrgRow {
  id: string;
  name: string;
  plan: Plan;
  isSuspended: boolean;
  suspendedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sessions: number;
  templates: number;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  isSuspended: boolean;
  suspendedAt: Date | null;
  createdAt: Date;
  organizationId: string | null;
}

const admin = { userId: "admin-1", role: "admin" as const, organizationId: "org-admin" };
const FIXED_NOW = new Date("2026-09-07T10:00:00.000Z");
const MONTH_START = "2026-09-01T00:00:00.000Z";

function createFakePrisma() {
  const calls: Array<{ method: string; args: any }> = [];
  const organizations: OrgRow[] = [
    { id: "org-admin", name: "Evalora HQ", plan: "ENTERPRISE", isSuspended: false, suspendedAt: null, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), sessions: 40, templates: 5 },
    { id: "org-acme", name: "Acme Talent", plan: "FREE", isSuspended: false, suspendedAt: null, createdAt: new Date("2026-03-01"), updatedAt: new Date("2026-03-02"), sessions: 12, templates: 2 },
  ];
  const users: UserRow[] = [
    { id: "admin-1", name: "Platform Admin", email: "admin@evalora.test", role: "ADMIN", emailVerified: true, isSuspended: false, suspendedAt: null, createdAt: new Date("2026-01-01"), organizationId: "org-admin" },
    { id: "owner-acme", name: "Ada Owner", email: "ada@acme.test", role: "ORGANIZATION", emailVerified: true, isSuspended: false, suspendedAt: null, createdAt: new Date("2026-03-01"), organizationId: "org-acme" },
    { id: "int-acme", name: "Ian Interviewer", email: "ian@acme.test", role: "INTERVIEWER", emailVerified: true, isSuspended: false, suspendedAt: null, createdAt: new Date("2026-03-05"), organizationId: "org-acme" },
    { id: "cand-1", name: "Cara Candidate", email: "cara@example.test", role: "CANDIDATE", emailVerified: false, isSuspended: false, suspendedAt: null, createdAt: new Date("2026-04-01"), organizationId: null },
    { id: "loner", name: "Lonely Staff", email: "lonely@example.test", role: "INTERVIEWER", emailVerified: true, isSuspended: false, suspendedAt: null, createdAt: new Date("2026-04-02"), organizationId: null },
  ];
  const record = (method: string, args: unknown) => calls.push({ method, args });
  const orgRow = (org: OrgRow) => ({
    id: org.id,
    name: org.name,
    plan: org.plan,
    isSuspended: org.isSuspended,
    suspendedAt: org.suspendedAt,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
    users: users
      .filter((user) => user.organizationId === org.id && user.role === "ORGANIZATION")
      .map((user) => ({ id: user.id, name: user.name, email: user.email })),
    _count: {
      users: users.filter((user) => user.organizationId === org.id && (user.role === "ORGANIZATION" || user.role === "INTERVIEWER")).length,
      sessions: org.sessions,
      templates: org.templates,
    },
  });
  const userRow = (user: UserRow) => {
    const org = organizations.find((row) => row.id === user.organizationId);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      isSuspended: user.isSuspended,
      suspendedAt: user.suspendedAt,
      createdAt: user.createdAt,
      organization: org ? { id: org.id, name: org.name, isSuspended: org.isSuspended } : null,
    };
  };

  const prisma = {
    organization: {
      count: async (args?: any) => {
        record("organization.count", args);
        if (args?.where?.isSuspended === true) return organizations.filter((org) => org.isSuspended).length;
        if (args?.where?.plan?.in) return 1;
        if (args?.where?.createdAt && !args.where.OR) return 1;
        return organizations.length;
      },
      groupBy: async (args: any) => {
        record("organization.groupBy", args);
        return [{ plan: "FREE", _count: { _all: 4 } }, { plan: "PRO", _count: { _all: 2 } }];
      },
      findMany: async (args: any) => {
        record("organization.findMany", args);
        return organizations.map(orgRow);
      },
      findUnique: async (args: any) => {
        record("organization.findUnique", args);
        const org = organizations.find((row) => row.id === args.where.id);
        if (!org) return null;
        return args.select?.users ? orgRow(org) : { id: org.id, isSuspended: org.isSuspended, plan: org.plan };
      },
      update: async (args: any) => {
        record("organization.update", args);
        const org = organizations.find((row) => row.id === args.where.id)!;
        Object.assign(org, args.data);
        return orgRow(org);
      },
    },
    user: {
      count: async (args?: any) => {
        record("user.count", args);
        if (args?.where?.organizationId) {
          return users.filter((user) => user.organizationId === args.where.organizationId && user.role === args.where.role).length;
        }
        if (args?.where?.isSuspended === true) return users.filter((user) => user.isSuspended).length;
        return users.length;
      },
      groupBy: async (args: any) => {
        record("user.groupBy", args);
        return [
          { role: "ADMIN", _count: { _all: 1 } },
          { role: "ORGANIZATION", _count: { _all: 6 } },
          { role: "INTERVIEWER", _count: { _all: 5 } },
          { role: "CANDIDATE", _count: { _all: 12 } },
        ];
      },
      findMany: async (args: any) => {
        record("user.findMany", args);
        return users.map(userRow);
      },
      findUnique: async (args: any) => {
        record("user.findUnique", args);
        const user = users.find((row) => row.id === args.where.id);
        if (!user) return null;
        return args.select?.organization
          ? userRow(user)
          : { id: user.id, role: user.role, organizationId: user.organizationId, isSuspended: user.isSuspended };
      },
      update: async (args: any) => {
        record("user.update", args);
        const user = users.find((row) => row.id === args.where.id)!;
        Object.assign(user, args.data);
        return userRow(user);
      },
    },
    interviewSession: {
      groupBy: async (args: any) => {
        record("session.groupBy", args);
        return [
          { status: "COMPLETED", _count: { _all: 60 } },
          { status: "IN_PROGRESS", _count: { _all: 3 } },
          { status: "NOT_STARTED", _count: { _all: 30 } },
          { status: "EXPIRED", _count: { _all: 10 } },
        ];
      },
      count: async (args: any) => {
        record("session.count", args);
        return args?.where?.status === "COMPLETED" ? 7 : 15;
      },
    },
    aIMessage: {
      count: async (args: any) => {
        record("aiMessage.count", args);
        const billable = Boolean(args.where.metadata);
        const month = Boolean(args.where.createdAt);
        if (billable) return month ? 4 : 10;
        return month ? 12 : 25;
      },
    },
    assessmentTemplateDraft: {
      count: async (args: any) => {
        record("draft.count", args);
        return args.where.createdAt ? 1 : 3;
      },
    },
  };
  const health = {
    snapshot: async (access: unknown) => {
      record("health.snapshot", access);
      return { capturedAt: FIXED_NOW.toISOString(), services: [] };
    },
  };
  return { calls, organizations, users, prisma, health };
}

function createService(costPerTurnUsd = 0.002) {
  const fake = createFakePrisma();
  const service = new AdminService(fake.prisma as never, fake.health as never, { costPerTurnUsd, now: () => FIXED_NOW });
  return { fake, service };
}

test("overview aggregates platform totals and prices only model-generated work", async () => {
  const { service, fake } = createService();

  const overview = await service.overview(admin);

  assert.equal(overview.asOf, FIXED_NOW.toISOString());
  assert.equal(overview.monthStart, MONTH_START);
  assert.deepEqual(overview.organizations, {
    total: 2,
    active: 2,
    suspended: 0,
    newThisMonth: 1,
    byPlan: { free: 4, pro: 2, enterprise: 0 },
    paidSubscriptions: 1,
  });
  assert.equal(overview.users.total, 24);
  assert.deepEqual(overview.users.byRole, { admin: 1, organization: 6, interviewer: 5, candidate: 12 });
  assert.equal(overview.sessions.total, 103);
  assert.equal(overview.sessions.live, 3);
  assert.equal(overview.sessions.thisMonth, 15);
  assert.equal(overview.sessions.completedThisMonth, 7);
  assert.deepEqual(overview.ai.interviewTurns, { allTime: 25, thisMonth: 12 });
  assert.deepEqual(overview.ai.billableTurns, { allTime: 10, thisMonth: 4 });
  assert.deepEqual(overview.ai.draftGenerations, { allTime: 3, thisMonth: 1 });
  // (10 billable turns + 3 drafts) x 0.002 and (4 + 1) x 0.002 — fallback turns cost nothing.
  assert.deepEqual(overview.ai.estimatedCostUsd, { allTime: 0.026, thisMonth: 0.01 });
  assert.equal(overview.ai.costPerTurnUsd, 0.002);

  const billable = fake.calls.find((call) => call.method === "aiMessage.count" && call.args.where.metadata);
  assert.deepEqual(billable?.args.where, { role: "assistant", metadata: { path: ["provider"], equals: "deepseek" } });
  const monthScoped = fake.calls.filter((call) => call.args?.where?.createdAt?.gte instanceof Date);
  assert.ok(monthScoped.length >= 6);
  assert.ok(monthScoped.every((call) => call.args.where.createdAt.gte.toISOString() === MONTH_START));
  // The health snapshot runs with the admin's own (platform-wide) access context.
  assert.deepEqual(fake.calls.find((call) => call.method === "health.snapshot")?.args, admin);
});

test("cost per turn comes from the environment and falls back on junk", () => {
  assert.equal(readAiCostPerTurnFromEnv({ AI_COST_PER_TURN_USD: "0.0035" }), 0.0035);
  assert.equal(readAiCostPerTurnFromEnv({ AI_COST_PER_TURN_USD: "banana" }), DEFAULT_AI_COST_PER_TURN_USD);
  assert.equal(readAiCostPerTurnFromEnv({ AI_COST_PER_TURN_USD: "-1" }), DEFAULT_AI_COST_PER_TURN_USD);
  assert.equal(readAiCostPerTurnFromEnv({}), DEFAULT_AI_COST_PER_TURN_USD);
});

test("organizations list searches name or owner email, filters, and paginates", async () => {
  const { service, fake } = createService();

  const page = await service.listOrganizations(admin, { q: "  acme ", page: 2, pageSize: 10, plan: "free", status: "active" });

  const findMany = fake.calls.find((call) => call.method === "organization.findMany")!.args;
  assert.equal(findMany.skip, 10);
  assert.equal(findMany.take, 10);
  assert.deepEqual(findMany.where, {
    plan: "FREE",
    isSuspended: false,
    OR: [
      { name: { contains: "acme", mode: "insensitive" } },
      { users: { some: { role: "ORGANIZATION", email: { contains: "acme", mode: "insensitive" } } } },
    ],
  });
  assert.equal(page.page, 2);
  assert.equal(page.pageSize, 10);
  assert.equal(page.total, 2);
  assert.equal(page.totalPages, 1);

  const acme = page.items.find((item) => item.id === "org-acme")!;
  assert.equal(acme.plan, "free");
  assert.deepEqual(acme.owner, { id: "owner-acme", name: "Ada Owner", email: "ada@acme.test" });
  assert.equal(acme.memberCount, 2);
  assert.equal(acme.sessionCount, 12);
  assert.equal(acme.templateCount, 2);
  assert.equal(acme.isCurrentWorkspace, false);
  assert.equal(page.items.find((item) => item.id === "org-admin")!.isCurrentWorkspace, true);
});

test("users list applies role, status, and search filters and caps the page size", async () => {
  const { service, fake } = createService();

  const result = await service.listUsers(admin, { q: "ada", role: "interviewer", status: "suspended", pageSize: 500 });

  const findMany = fake.calls.find((call) => call.method === "user.findMany")!.args;
  assert.deepEqual(findMany.where, {
    role: "INTERVIEWER",
    isSuspended: true,
    OR: [{ name: { contains: "ada", mode: "insensitive" } }, { email: { contains: "ada", mode: "insensitive" } }],
  });
  assert.equal(findMany.take, 100);
  assert.equal(findMany.skip, 0);

  const me = result.items.find((item) => item.id === "admin-1")!;
  assert.equal(me.isCurrentUser, true);
  assert.equal(me.roleLabel, "Platform admin");
  assert.deepEqual(result.items.find((item) => item.id === "owner-acme")!.organization, { id: "org-acme", name: "Acme Talent", isSuspended: false });
  assert.equal(result.items.find((item) => item.id === "cand-1")!.organization, undefined);
  assert.equal(result.items.find((item) => item.id === "cand-1")!.roleLabel, "Candidate");
});

test("an admin cannot deactivate themselves; suspension stamps and clears suspendedAt", async () => {
  const { service, fake } = createService();

  await assert.rejects(service.setUserStatus(admin, "admin-1", true), (error: unknown) => {
    assert.ok(error instanceof ForbiddenException);
    assert.equal(error.message, ADMIN_MESSAGES.selfDeactivate);
    return true;
  });
  await assert.rejects(service.setUserStatus(admin, "ghost", true), NotFoundException);

  const suspended = await service.setUserStatus(admin, "int-acme", true);
  assert.equal(suspended.isSuspended, true);
  assert.equal(suspended.suspendedAt, FIXED_NOW.toISOString());

  const restored = await service.setUserStatus(admin, "int-acme", false);
  assert.equal(restored.isSuspended, false);
  assert.equal(restored.suspendedAt, undefined);

  // Re-applying the current state writes nothing.
  const updatesBefore = fake.calls.filter((call) => call.method === "user.update").length;
  await service.setUserStatus(admin, "int-acme", false);
  assert.equal(fake.calls.filter((call) => call.method === "user.update").length, updatesBefore);
});

test("role changes guard self, candidates, workspace-less staff, and the last owner", async () => {
  const { service } = createService();
  const rejects = async (promise: Promise<unknown>, type: new (...args: any[]) => Error, message: string) => {
    await assert.rejects(promise, (error: unknown) => {
      assert.ok(error instanceof type, `expected ${type.name}`);
      assert.equal(error.message, message);
      return true;
    });
  };

  await rejects(service.setUserRole(admin, "admin-1", "organization"), ForbiddenException, ADMIN_MESSAGES.selfRoleChange);
  await rejects(service.setUserRole(admin, "cand-1", "interviewer"), BadRequestException, ADMIN_MESSAGES.candidateRole);
  await rejects(service.setUserRole(admin, "int-acme", "candidate"), BadRequestException, ADMIN_MESSAGES.candidateRole);
  await rejects(service.setUserRole(admin, "loner", "organization"), BadRequestException, ADMIN_MESSAGES.noWorkspace);
  await rejects(service.setUserRole(admin, "owner-acme", "interviewer"), BadRequestException, ADMIN_MESSAGES.onlyOwner);
  await assert.rejects(service.setUserRole(admin, "ghost", "admin"), NotFoundException);

  const promoted = await service.setUserRole(admin, "int-acme", "organization");
  assert.equal(promoted.role, "organization");
  // Acme now has two owners, so the original owner may step down.
  const demoted = await service.setUserRole(admin, "owner-acme", "interviewer");
  assert.equal(demoted.role, "interviewer");
  // Platform admin needs no workspace.
  const elevated = await service.setUserRole(admin, "loner", "admin");
  assert.equal(elevated.role, "admin");
  assert.equal(elevated.roleLabel, "Platform admin");
});

test("workspace suspension refuses the admin's own workspace and is visible on its members", async () => {
  const { service } = createService();

  await assert.rejects(service.setOrganizationStatus(admin, "org-admin", true), (error: unknown) => {
    assert.ok(error instanceof ForbiddenException);
    assert.equal(error.message, ADMIN_MESSAGES.selfWorkspaceSuspend);
    return true;
  });
  await assert.rejects(service.setOrganizationStatus(admin, "missing", true), NotFoundException);

  const suspended = await service.setOrganizationStatus(admin, "org-acme", true);
  assert.equal(suspended.isSuspended, true);
  assert.equal(suspended.suspendedAt, FIXED_NOW.toISOString());

  const users = await service.listUsers(admin, {});
  assert.equal(users.items.find((item) => item.id === "owner-acme")!.organization?.isSuspended, true);

  const reactivated = await service.setOrganizationStatus(admin, "org-acme", false);
  assert.equal(reactivated.isSuspended, false);
  assert.equal(reactivated.suspendedAt, undefined);
  // Reactivating your own workspace is always allowed.
  assert.equal((await service.setOrganizationStatus(admin, "org-admin", false)).isSuspended, false);
});

test("plan changes persist the enum value and return the lowercase plan", async () => {
  const { service, fake } = createService();

  const updated = await service.setOrganizationPlan(admin, "org-acme", "pro");

  assert.equal(updated.plan, "pro");
  assert.deepEqual(fake.calls.find((call) => call.method === "organization.update")!.args.data, { plan: "PRO" });
  await assert.rejects(service.setOrganizationPlan(admin, "missing", "pro"), NotFoundException);
});

test("every admin route is guarded and rejects non-admin roles with 403", () => {
  const guards = Reflect.getMetadata("__guards__", AdminController) as unknown[];
  assert.ok(guards.includes(JwtAuthGuard));
  assert.ok(guards.includes(RolesGuard));

  const guard = new RolesGuard(new Reflector());
  const handlers = ["overview", "listOrganizations", "setOrganizationStatus", "setOrganizationPlan", "listUsers", "setUserStatus", "setUserRole"] as const;
  for (const name of handlers) {
    const handler = AdminController.prototype[name];
    const contextFor = (role: string) =>
      ({
        getHandler: () => handler,
        getClass: () => AdminController,
        switchToHttp: () => ({ getRequest: () => ({ user: { id: "u-1", email: "u@example.com", role } }) }),
      }) as never;

    assert.throws(() => guard.canActivate(contextFor("organization")), ForbiddenException, name);
    assert.throws(() => guard.canActivate(contextFor("interviewer")), ForbiddenException, name);
    assert.throws(() => guard.canActivate(contextFor("candidate")), ForbiddenException, name);
    assert.equal(guard.canActivate(contextFor("admin")), true, name);
  }
});
