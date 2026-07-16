import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as bcrypt from "bcryptjs";
import { OrganizationService } from "../src/modules/organization/organization.service";
import type { AccessContext } from "../src/modules/auth/access-control";

type Role = "ADMIN" | "ORGANIZATION" | "INTERVIEWER" | "CANDIDATE";
type InviteStatus = "PENDING" | "ACCEPTED" | "CANCELLED" | "EXPIRED";

interface UserRow {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  organizationId: string | null;
  createdAt: Date;
}

interface InviteRow {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  token: string;
  status: InviteStatus;
  invitedById: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function createFakePrisma() {
  const users: UserRow[] = [];
  const invites: InviteRow[] = [];
  const organizations = [{ id: "org-1", name: "Acme Talent" }];

  const prisma = {
    user: {
      async findMany(args: { where: { organizationId: string; role: { in: Role[] } }; orderBy: unknown; select: unknown }) {
        return users
          .filter((user) => user.organizationId === args.where.organizationId && args.where.role.in.includes(user.role))
          .map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            organizationId: user.organizationId,
            createdAt: user.createdAt,
          }));
      },
      async findUnique(args: { where: { email?: string; id?: string }; select?: unknown }) {
        const user = users.find((row) => (args.where.email ? row.email === args.where.email : row.id === args.where.id));
        return user
          ? {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              organizationId: user.organizationId,
              passwordHash: user.passwordHash,
            }
          : null;
      },
      async findFirst(args: { where: { id: string; organizationId: string }; select?: unknown }) {
        const user = users.find((row) => row.id === args.where.id && row.organizationId === args.where.organizationId);
        return user ? { id: user.id, role: user.role } : null;
      },
      async create(args: {
        data: { name: string; email: string; passwordHash: string; role: Role; organizationId: string };
        select: unknown;
      }) {
        const user: UserRow = {
          id: `user-${users.length + 1}`,
          name: args.data.name,
          email: args.data.email,
          passwordHash: args.data.passwordHash,
          role: args.data.role,
          organizationId: args.data.organizationId,
          createdAt: new Date(),
        };
        users.push(user);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
        };
      },
      async update(args: { where: { id: string }; data: { organizationId: string | null } }) {
        const user = users.find((row) => row.id === args.where.id);
        if (!user) throw new Error("missing user");
        user.organizationId = args.data.organizationId;
        return user;
      },
    },
    organization: {
      async findUnique(args: { where: { id: string }; select: { name: true } }) {
        const org = organizations.find((row) => row.id === args.where.id);
        return org ? { name: org.name } : null;
      },
    },
    organizationInvite: {
      async findMany(args: { where: { organizationId: string; status: { in: InviteStatus[] } }; orderBy: unknown; take: number; include: unknown }) {
        return invites
          .filter((invite) => invite.organizationId === args.where.organizationId && args.where.status.in.includes(invite.status))
          .map((invite) => ({
            ...invite,
            invitedBy: users.find((user) => user.id === invite.invitedById)
              ? { id: invite.invitedById, name: users.find((user) => user.id === invite.invitedById)!.name }
              : null,
          }));
      },
      async findFirst(args: { where: { organizationId: string; email: string; status: InviteStatus; expiresAt: { gt: Date } } }) {
        return (
          invites.find(
            (invite) =>
              invite.organizationId === args.where.organizationId &&
              invite.email === args.where.email &&
              invite.status === args.where.status &&
              invite.expiresAt > args.where.expiresAt.gt,
          ) ?? null
        );
      },
      async findUnique(args: { where: { token: string } }) {
        return invites.find((invite) => invite.token === args.where.token) ?? null;
      },
      async create(args: {
        data: {
          organizationId: string;
          email: string;
          role: Role;
          token: string;
          invitedById: string;
          expiresAt: Date;
          status: InviteStatus;
        };
        include: unknown;
      }) {
        const invite: InviteRow = {
          id: `invite-${invites.length + 1}`,
          organizationId: args.data.organizationId,
          email: args.data.email,
          role: args.data.role,
          token: args.data.token,
          status: args.data.status,
          invitedById: args.data.invitedById,
          expiresAt: args.data.expiresAt,
          acceptedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        invites.push(invite);
        return {
          ...invite,
          invitedBy: { id: args.data.invitedById, name: users.find((user) => user.id === args.data.invitedById)?.name ?? "Owner" },
        };
      },
      async update(args: { where: { id: string }; data: Partial<{ status: InviteStatus; acceptedAt: Date }> }) {
        const invite = invites.find((row) => row.id === args.where.id);
        if (!invite) throw new Error("missing invite");
        Object.assign(invite, args.data, { updatedAt: new Date() });
        return invite;
      },
      async updateMany(args: { where: { organizationId: string; status: InviteStatus; expiresAt: { lte: Date } }; data: { status: InviteStatus } }) {
        let count = 0;
        for (const invite of invites) {
          if (
            invite.organizationId === args.where.organizationId &&
            invite.status === args.where.status &&
            invite.expiresAt <= args.where.expiresAt.lte
          ) {
            invite.status = args.data.status;
            count += 1;
          }
        }
        return { count };
      },
    },
    async $transaction<T>(fn: (tx: typeof prisma) => Promise<T>) {
      return fn(prisma);
    },
  };

  return { prisma, users, invites };
}

const ownerAccess: AccessContext = {
  userId: "owner-1",
  role: "organization",
  organizationId: "org-1",
};

const interviewerAccess: AccessContext = {
  userId: "int-1",
  role: "interviewer",
  organizationId: "org-1",
};

test("workspace owner can invite an interviewer by email", async () => {
  const { prisma, users } = createFakePrisma();
  users.push({
    id: "owner-1",
    name: "Owner",
    email: "owner@acme.com",
    passwordHash: "hash",
    role: "ORGANIZATION",
    organizationId: "org-1",
    createdAt: new Date(),
  });
  const service = new OrganizationService(prisma as never);

  const invite = await service.createInvite(ownerAccess, { email: "interviewer@acme.com" });
  assert.equal(invite.email, "interviewer@acme.com");
  assert.equal(invite.role, "interviewer");
  assert.equal(invite.status, "pending");
  assert.ok(invite.token.length > 10);
  assert.equal(invite.inviteUrlPath, `/invite/${invite.token}`);
});

test("interviewers cannot create invites", async () => {
  const { prisma } = createFakePrisma();
  const service = new OrganizationService(prisma as never);
  await assert.rejects(
    () => service.createInvite(interviewerAccess, { email: "x@acme.com" }),
    /only the workspace owner/i,
  );
});

test("accept invite creates interviewer in the same organization", async () => {
  const { prisma, users, invites } = createFakePrisma();
  users.push({
    id: "owner-1",
    name: "Owner",
    email: "owner@acme.com",
    passwordHash: "hash",
    role: "ORGANIZATION",
    organizationId: "org-1",
    createdAt: new Date(),
  });
  invites.push({
    id: "invite-1",
    organizationId: "org-1",
    email: "newhire@acme.com",
    role: "INTERVIEWER",
    token: "tok-abc",
    status: "PENDING",
    invitedById: "owner-1",
    expiresAt: new Date(Date.now() + 60_000),
    acceptedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const service = new OrganizationService(prisma as never);
  const result = await service.acceptInvite({
    token: "tok-abc",
    name: "New Hire",
    password: "SecurePass1",
  });

  assert.equal(result.user.email, "newhire@acme.com");
  assert.equal(result.user.role, "interviewer");
  assert.equal(result.user.organizationId, "org-1");
  assert.equal(invites[0].status, "ACCEPTED");
  assert.equal(users.some((user) => user.email === "newhire@acme.com" && user.role === "INTERVIEWER"), true);
  assert.equal(await bcrypt.compare("SecurePass1", users.find((user) => user.email === "newhire@acme.com")!.passwordHash), true);
});

test("owner can remove interviewer but not themselves", async () => {
  const { prisma, users } = createFakePrisma();
  users.push(
    {
      id: "owner-1",
      name: "Owner",
      email: "owner@acme.com",
      passwordHash: "hash",
      role: "ORGANIZATION",
      organizationId: "org-1",
      createdAt: new Date(),
    },
    {
      id: "int-1",
      name: "Interviewer",
      email: "int@acme.com",
      passwordHash: "hash",
      role: "INTERVIEWER",
      organizationId: "org-1",
      createdAt: new Date(),
    },
  );
  const service = new OrganizationService(prisma as never);

  await assert.rejects(() => service.removeMember(ownerAccess, "owner-1"), /cannot remove yourself/i);
  const removed = await service.removeMember(ownerAccess, "int-1");
  assert.equal(removed.removed, true);
  assert.equal(users.find((user) => user.id === "int-1")!.organizationId, null);
});
