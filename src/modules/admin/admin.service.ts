import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { SessionStatus, UserRole } from "../../domain/evalora.types";
import { PrismaService } from "../../prisma/prisma.service";
import { SystemHealthService } from "../analytics/system-health.service";
import type { AccessContext } from "../auth/access-control";
import type {
  AdminAccountStatus,
  AdminOrganizationDto,
  AdminOverviewDto,
  AdminPageDto,
  AdminUserDto,
  SubscriptionPlanDto,
} from "./admin.types";
import { ADMIN_MAX_PAGE_SIZE } from "./dto/admin.dto";

type PrismaRole = "ADMIN" | "ORGANIZATION" | "INTERVIEWER" | "CANDIDATE";
type PrismaPlan = "FREE" | "PRO" | "ENTERPRISE";
type PrismaSessionStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED";

const DEFAULT_PAGE_SIZE = 25;
/**
 * Working estimate for one DeepSeek V4 Flash generation (prompt + completion)
 * at the token volumes an interview turn or draft produces. Override with
 * AI_COST_PER_TURN_USD once real invoices are available.
 */
export const DEFAULT_AI_COST_PER_TURN_USD = 0.002;
const AI_PROVIDER_TAG = "deepseek";
const COST_METHODOLOGY =
  "Estimated as (billable interview turns + AI draft generations) x cost per turn. Only work produced by the configured model counts; deterministic fallback output is free.";

export const ADMIN_MESSAGES = {
  userNotFound: "User not found.",
  organizationNotFound: "Organization not found.",
  selfDeactivate: "You cannot deactivate your own account.",
  selfRoleChange: "You cannot change your own role.",
  selfWorkspaceSuspend: "You cannot suspend your own workspace.",
  candidateRole: "Candidate records cannot be assigned a workspace role. Invite them to a workspace instead.",
  noWorkspace: "This user has no workspace. Assign them to a workspace before changing their role.",
  onlyOwner: "This user is the only owner of their workspace. Promote another member first.",
} as const;

export interface AdminListQuery {
  q?: string;
  status?: AdminAccountStatus;
  page?: number;
  pageSize?: number;
}

export interface AdminOrganizationsQuery extends AdminListQuery {
  plan?: SubscriptionPlanDto;
}

export interface AdminUsersQuery extends AdminListQuery {
  role?: UserRole;
}

export interface AdminServiceOptions {
  costPerTurnUsd?: number;
  now?: () => Date;
}

const ORGANIZATION_SELECT = {
  id: true,
  name: true,
  plan: true,
  isSuspended: true,
  suspendedAt: true,
  createdAt: true,
  updatedAt: true,
  users: {
    where: { role: "ORGANIZATION" },
    orderBy: { createdAt: "asc" },
    take: 1,
    select: { id: true, name: true, email: true },
  },
  _count: {
    select: {
      users: { where: { role: { in: ["ORGANIZATION", "INTERVIEWER"] } } },
      sessions: true,
      templates: true,
    },
  },
} satisfies Prisma.OrganizationSelect;

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  emailVerified: true,
  isSuspended: true,
  suspendedAt: true,
  createdAt: true,
  organization: { select: { id: true, name: true, isSuspended: true } },
} satisfies Prisma.UserSelect;

type OrganizationRow = Prisma.OrganizationGetPayload<{ select: typeof ORGANIZATION_SELECT }>;
type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

/** Reads the per-turn estimate from the environment, ignoring junk so a typo cannot zero or explode the dashboard. */
export function readAiCostPerTurnFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.AI_COST_PER_TURN_USD?.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_AI_COST_PER_TURN_USD;
}

/**
 * Platform-wide operations for the super-admin dashboard. Every method assumes
 * the caller already passed `@Roles("admin")`; the service only adds the
 * guardrails that role checks cannot express (self-lockout, last owner).
 */
@Injectable()
export class AdminService {
  private readonly costPerTurnUsd: number;
  private readonly now: () => Date;

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemHealth: SystemHealthService,
    options: AdminServiceOptions = {},
  ) {
    this.costPerTurnUsd = options.costPerTurnUsd ?? DEFAULT_AI_COST_PER_TURN_USD;
    this.now = options.now ?? (() => new Date());
  }

  async overview(access: AccessContext): Promise<AdminOverviewDto> {
    const asOf = this.now();
    const monthStart = startOfUtcMonth(asOf);
    const thisMonth = { gte: monthStart };
    const billableTurnWhere: Prisma.AIMessageWhereInput = {
      role: "assistant",
      metadata: { path: ["provider"], equals: AI_PROVIDER_TAG },
    };

    const [
      organizationTotal,
      organizationSuspended,
      organizationNewThisMonth,
      organizationsByPlan,
      paidSubscriptions,
      usersByRole,
      usersSuspended,
      usersNewThisMonth,
      sessionsByStatus,
      sessionsThisMonth,
      completedThisMonth,
      interviewTurnsAllTime,
      interviewTurnsThisMonth,
      billableTurnsAllTime,
      billableTurnsThisMonth,
      draftsAllTime,
      draftsThisMonth,
      systemHealth,
    ] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.organization.count({ where: { isSuspended: true } }),
      this.prisma.organization.count({ where: { createdAt: thisMonth } }),
      this.prisma.organization.groupBy({ by: ["plan"], _count: { _all: true } }),
      this.prisma.organization.count({ where: { isSuspended: false, plan: { in: ["PRO", "ENTERPRISE"] } } }),
      this.prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      this.prisma.user.count({ where: { isSuspended: true } }),
      this.prisma.user.count({ where: { createdAt: thisMonth } }),
      this.prisma.interviewSession.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.interviewSession.count({ where: { createdAt: thisMonth } }),
      this.prisma.interviewSession.count({ where: { status: "COMPLETED", completedAt: thisMonth } }),
      this.prisma.aIMessage.count({ where: { role: "assistant" } }),
      this.prisma.aIMessage.count({ where: { role: "assistant", createdAt: thisMonth } }),
      this.prisma.aIMessage.count({ where: billableTurnWhere }),
      this.prisma.aIMessage.count({ where: { ...billableTurnWhere, createdAt: thisMonth } }),
      this.prisma.assessmentTemplateDraft.count({ where: { provider: AI_PROVIDER_TAG } }),
      this.prisma.assessmentTemplateDraft.count({ where: { provider: AI_PROVIDER_TAG, createdAt: thisMonth } }),
      // Admin access carries no workspace scope, so the snapshot covers the platform.
      this.systemHealth.snapshot(access),
    ]);

    const byPlan: Record<SubscriptionPlanDto, number> = { free: 0, pro: 0, enterprise: 0 };
    for (const group of organizationsByPlan) byPlan[toPlanDto(group.plan)] = group._count._all;

    const byRole: Record<UserRole, number> = { admin: 0, organization: 0, interviewer: 0, candidate: 0 };
    let usersTotal = 0;
    for (const group of usersByRole) {
      byRole[fromPrismaRole(group.role)] = group._count._all;
      usersTotal += group._count._all;
    }

    const byStatus: Record<SessionStatus, number> = { not_started: 0, in_progress: 0, completed: 0, expired: 0 };
    let sessionsTotal = 0;
    for (const group of sessionsByStatus) {
      byStatus[fromPrismaStatus(group.status)] = group._count._all;
      sessionsTotal += group._count._all;
    }

    return {
      asOf: asOf.toISOString(),
      monthStart: monthStart.toISOString(),
      organizations: {
        total: organizationTotal,
        active: organizationTotal - organizationSuspended,
        suspended: organizationSuspended,
        newThisMonth: organizationNewThisMonth,
        byPlan,
        paidSubscriptions,
      },
      users: { total: usersTotal, suspended: usersSuspended, newThisMonth: usersNewThisMonth, byRole },
      sessions: {
        total: sessionsTotal,
        thisMonth: sessionsThisMonth,
        completedThisMonth,
        live: byStatus.in_progress,
        byStatus,
      },
      ai: {
        provider: process.env.DEEPSEEK_API_KEY?.trim() ? "deepseek" : "fallback",
        ...(process.env.DEEPSEEK_MODEL?.trim() ? { model: process.env.DEEPSEEK_MODEL.trim() } : {}),
        costPerTurnUsd: this.costPerTurnUsd,
        interviewTurns: { allTime: interviewTurnsAllTime, thisMonth: interviewTurnsThisMonth },
        billableTurns: { allTime: billableTurnsAllTime, thisMonth: billableTurnsThisMonth },
        draftGenerations: { allTime: draftsAllTime, thisMonth: draftsThisMonth },
        estimatedCostUsd: {
          allTime: this.estimateCost(billableTurnsAllTime + draftsAllTime),
          thisMonth: this.estimateCost(billableTurnsThisMonth + draftsThisMonth),
        },
        methodology: COST_METHODOLOGY,
      },
      systemHealth,
    };
  }

  async listOrganizations(access: AccessContext, query: AdminOrganizationsQuery): Promise<AdminPageDto<AdminOrganizationDto>> {
    const { page, pageSize, skip } = paginate(query);
    const q = query.q?.trim();
    const where: Prisma.OrganizationWhereInput = {
      ...(query.plan ? { plan: toPrismaPlan(query.plan) } : {}),
      ...statusWhere(query.status),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { users: { some: { role: "ORGANIZATION", email: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, select: ORGANIZATION_SELECT }),
    ]);

    return pageOf(rows.map((row) => toOrganizationDto(row, access)), page, pageSize, total);
  }

  async setOrganizationStatus(access: AccessContext, organizationId: string, isSuspended: boolean): Promise<AdminOrganizationDto> {
    // Reactivating your own workspace is harmless; suspending it would cascade
    // to every colleague and leave only the admin exemption standing.
    if (isSuspended && access.organizationId === organizationId) {
      throw new ForbiddenException(ADMIN_MESSAGES.selfWorkspaceSuspend);
    }
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, isSuspended: true },
    });
    if (!organization) throw new NotFoundException(ADMIN_MESSAGES.organizationNotFound);

    if (organization.isSuspended !== isSuspended) {
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: { isSuspended, suspendedAt: isSuspended ? this.now() : null },
      });
    }
    return this.getOrganization(access, organizationId);
  }

  async setOrganizationPlan(access: AccessContext, organizationId: string, plan: SubscriptionPlanDto): Promise<AdminOrganizationDto> {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, plan: true } });
    if (!organization) throw new NotFoundException(ADMIN_MESSAGES.organizationNotFound);

    const nextPlan = toPrismaPlan(plan);
    if (organization.plan !== nextPlan) {
      await this.prisma.organization.update({ where: { id: organizationId }, data: { plan: nextPlan } });
    }
    return this.getOrganization(access, organizationId);
  }

  async listUsers(access: AccessContext, query: AdminUsersQuery): Promise<AdminPageDto<AdminUserDto>> {
    const { page, pageSize, skip } = paginate(query);
    const q = query.q?.trim();
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: toPrismaRole(query.role) } : {}),
      ...statusWhere(query.status),
      ...(q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, orderBy: [{ createdAt: "desc" }, { email: "asc" }], skip, take: pageSize, select: USER_SELECT }),
    ]);

    return pageOf(rows.map((row) => toUserDto(row, access)), page, pageSize, total);
  }

  async setUserStatus(access: AccessContext, userId: string, isSuspended: boolean): Promise<AdminUserDto> {
    if (userId === access.userId) throw new ForbiddenException(ADMIN_MESSAGES.selfDeactivate);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, isSuspended: true } });
    if (!user) throw new NotFoundException(ADMIN_MESSAGES.userNotFound);

    if (user.isSuspended !== isSuspended) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { isSuspended, suspendedAt: isSuspended ? this.now() : null },
      });
    }
    return this.getUser(access, userId);
  }

  async setUserRole(access: AccessContext, userId: string, role: UserRole): Promise<AdminUserDto> {
    if (userId === access.userId) throw new ForbiddenException(ADMIN_MESSAGES.selfRoleChange);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, organizationId: true },
    });
    if (!user) throw new NotFoundException(ADMIN_MESSAGES.userNotFound);
    // Candidate rows carry a random, unusable password hash. Flipping the role
    // would create a staff account nobody can sign in to; the invite flow is the
    // path that also sets a password.
    if (user.role === "CANDIDATE" || role === "candidate") throw new BadRequestException(ADMIN_MESSAGES.candidateRole);

    const nextRole = toPrismaRole(role);
    if (nextRole === user.role) return this.getUser(access, userId);
    if (nextRole !== "ADMIN" && !user.organizationId) throw new BadRequestException(ADMIN_MESSAGES.noWorkspace);
    if (user.role === "ORGANIZATION" && nextRole === "INTERVIEWER" && user.organizationId) {
      const owners = await this.prisma.user.count({ where: { organizationId: user.organizationId, role: "ORGANIZATION" } });
      if (owners <= 1) throw new BadRequestException(ADMIN_MESSAGES.onlyOwner);
    }

    await this.prisma.user.update({ where: { id: userId }, data: { role: nextRole } });
    return this.getUser(access, userId);
  }

  private async getOrganization(access: AccessContext, organizationId: string): Promise<AdminOrganizationDto> {
    const row = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: ORGANIZATION_SELECT });
    if (!row) throw new NotFoundException(ADMIN_MESSAGES.organizationNotFound);
    return toOrganizationDto(row, access);
  }

  private async getUser(access: AccessContext, userId: string): Promise<AdminUserDto> {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
    if (!row) throw new NotFoundException(ADMIN_MESSAGES.userNotFound);
    return toUserDto(row, access);
  }

  private estimateCost(units: number): number {
    return Math.round(units * this.costPerTurnUsd * 10_000) / 10_000;
  }
}

function toOrganizationDto(row: OrganizationRow, access: AccessContext): AdminOrganizationDto {
  const owner = row.users[0];
  return {
    id: row.id,
    name: row.name,
    plan: toPlanDto(row.plan),
    isSuspended: row.isSuspended,
    ...(row.suspendedAt ? { suspendedAt: row.suspendedAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(owner ? { owner: { id: owner.id, name: owner.name, email: owner.email } } : {}),
    memberCount: row._count.users,
    sessionCount: row._count.sessions,
    templateCount: row._count.templates,
    isCurrentWorkspace: access.organizationId === row.id,
  };
}

function toUserDto(row: UserRow, access: AccessContext): AdminUserDto {
  const role = fromPrismaRole(row.role);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role,
    roleLabel: roleLabel(role),
    emailVerified: row.emailVerified,
    isSuspended: row.isSuspended,
    ...(row.suspendedAt ? { suspendedAt: row.suspendedAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    ...(row.organization
      ? { organization: { id: row.organization.id, name: row.organization.name, isSuspended: row.organization.isSuspended } }
      : {}),
    isCurrentUser: row.id === access.userId,
  };
}

function paginate(query: { page?: number; pageSize?: number }) {
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(ADMIN_MAX_PAGE_SIZE, Math.max(1, Math.floor(query.pageSize ?? DEFAULT_PAGE_SIZE)));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function pageOf<T>(items: T[], page: number, pageSize: number, total: number): AdminPageDto<T> {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

function statusWhere(status: AdminAccountStatus | undefined): { isSuspended?: boolean } {
  if (status === "suspended") return { isSuspended: true };
  if (status === "active") return { isSuspended: false };
  return {};
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function toPlanDto(plan: PrismaPlan): SubscriptionPlanDto {
  return plan.toLowerCase() as SubscriptionPlanDto;
}

function toPrismaPlan(plan: SubscriptionPlanDto): PrismaPlan {
  return plan.toUpperCase() as PrismaPlan;
}

function toPrismaRole(role: UserRole): PrismaRole {
  return role.toUpperCase() as PrismaRole;
}

function fromPrismaRole(role: PrismaRole): UserRole {
  return role.toLowerCase() as UserRole;
}

function fromPrismaStatus(status: PrismaSessionStatus): SessionStatus {
  return status.toLowerCase() as SessionStatus;
}

function roleLabel(role: UserRole): string {
  if (role === "admin") return "Platform admin";
  if (role === "organization") return "Owner";
  if (role === "interviewer") return "Interviewer";
  return "Candidate";
}
