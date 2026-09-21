import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { DEFAULT_LIST_LIMIT } from "../../common/query.constants";
import type { UserRole } from "../../domain/evalora.types";
import {
  assertIsWorkspaceOwner,
  requireOrganizationId,
  type AccessContext,
} from "../auth/access-control";
import { assertPasswordPolicy } from "../auth/password-policy";
import type { PrismaService } from "../../prisma/prisma.service";
import type { EmailDeliveryResult, EmailService } from "../email/email.service";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SALT_ROUNDS = 12;

export interface WorkspaceMemberDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** UI-friendly label: "Owner" | "Interviewer" */
  roleLabel: string;
  organizationId?: string;
  createdAt?: string;
  isCurrentUser?: boolean;
  profilePhoto?: string;
}

export interface WorkspaceInviteDto {
  id: string;
  email: string;
  role: UserRole;
  status: "pending" | "accepted" | "cancelled" | "expired";
  token: string;
  inviteUrlPath: string;
  /** Full absolute URL when APP_URL / FRONTEND_URL is known. */
  inviteUrl?: string;
  invitedBy?: { id: string; name: string };
  expiresAt: string;
  createdAt?: string;
  acceptedAt?: string;
  emailDelivery?: EmailDeliveryResult;
}

export interface InvitePreviewDto {
  email: string;
  organizationName: string;
  role: UserRole;
  roleLabel: string;
  expiresAt: string;
  inviterName?: string;
}

export interface CreateInviteInput {
  email?: string;
}

export interface AcceptInviteInput {
  token?: string;
  name?: string;
  password?: string;
}

export interface WorkspaceProfileDto {
  id: string;
  name: string;
  memberCount: number;
  ownerName?: string;
  ownerEmail?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateWorkspaceInput {
  name?: string;
}

export interface WorkspacePrivacySummaryDto {
  organizationId: string;
  organizationName: string;
  memberCount: number;
  templateCount: number;
  sessionCount: number;
  completedSessionCount: number;
  reportCount: number;
  inviteCount: number;
  oldestSessionAt?: string;
  newestSessionAt?: string;
  retentionPolicy: string;
  advisoryNotice: string;
}

export interface WorkspaceExportDto {
  exportedAt: string;
  organization: WorkspaceProfileDto;
  privacy: WorkspacePrivacySummaryDto;
  members: WorkspaceMemberDto[];
  templates: Array<{
    id: string;
    title: string;
    description?: string;
    roleType: string;
    timeLimitMin?: number | null;
    moduleCount: number;
    questionCount: number;
    createdAt?: string;
    updatedAt?: string;
  }>;
  sessions: Array<{
    id: string;
    title?: string | null;
    candidateName?: string;
    candidateEmail?: string;
    templateId: string;
    templateTitle?: string;
    status: string;
    accessCode: string;
    startedAt?: string | null;
    completedAt?: string | null;
    createdAt?: string;
  }>;
  reports: Array<{
    sessionId: string;
    overallScore: number;
    summary: string;
    createdAt?: string;
  }>;
}

export interface DeleteWorkspaceDataResult {
  deleted: true;
  organizationId: string;
  deletedTemplates: number;
  deletedSessions: number;
  deletedInvites: number;
  message: string;
}

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService?: EmailService,
  ) {}

  async getWorkspace(access: AccessContext): Promise<WorkspaceProfileDto> {
    const organizationId = requireOrganizationId(access);
    const organization = await this.prisma.organization.findUnique({
      relationLoadStrategy: "join",
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        users: {
          where: { role: { in: ["ORGANIZATION", "INTERVIEWER"] } },
          select: { id: true, name: true, email: true, role: true },
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    if (!organization) throw new NotFoundException("Workspace not found.");

    const owner = organization.users.find((user) => user.role === "ORGANIZATION");
    return {
      id: organization.id,
      name: organization.name,
      memberCount: organization.users.length,
      ownerName: owner?.name,
      ownerEmail: owner?.email,
      createdAt: organization.createdAt.toISOString(),
      updatedAt: organization.updatedAt.toISOString(),
    };
  }

  async updateWorkspace(access: AccessContext, input: UpdateWorkspaceInput): Promise<WorkspaceProfileDto> {
    assertIsWorkspaceOwner(access);
    const organizationId = requireOrganizationId(access);
    const name = requireNonEmpty(input.name, "Organization name is required.").slice(0, 120);

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { name },
      select: { id: true },
    });

    return this.getWorkspace(access);
  }

  async getPrivacySummary(access: AccessContext): Promise<WorkspacePrivacySummaryDto> {
    const organizationId = requireOrganizationId(access);
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });
    if (!organization) throw new NotFoundException("Workspace not found.");

    const [memberCount, templateCount, sessionCount, completedSessionCount, inviteCount, sessionDates, reportCount] =
      await Promise.all([
        this.prisma.user.count({
          where: { organizationId, role: { in: ["ORGANIZATION", "INTERVIEWER"] } },
        }),
        this.prisma.assessmentTemplate.count({ where: { organizationId } }),
        this.prisma.interviewSession.count({ where: { organizationId } }),
        this.prisma.interviewSession.count({ where: { organizationId, status: "COMPLETED" } }),
        this.prisma.organizationInvite.count({ where: { organizationId } }),
        this.prisma.interviewSession.aggregate({
          where: { organizationId },
          _min: { createdAt: true },
          _max: { createdAt: true },
        }),
        this.prisma.candidateReport.count({
          where: { session: { organizationId } },
        }),
      ]);

    return {
      organizationId: organization.id,
      organizationName: organization.name,
      memberCount,
      templateCount,
      sessionCount,
      completedSessionCount,
      reportCount,
      inviteCount,
      oldestSessionAt: sessionDates._min.createdAt?.toISOString(),
      newestSessionAt: sessionDates._max.createdAt?.toISOString(),
      retentionPolicy:
        "Assessment sessions, responses, code submissions, evaluations, and reports are retained while this workspace is active. Owners can export or permanently wipe operational data from Settings.",
      advisoryNotice:
        "AI feedback is advisory and must be reviewed by a human interviewer. Behavioral results are not medical or mental-health diagnoses.",
    };
  }

  async exportWorkspaceData(access: AccessContext): Promise<WorkspaceExportDto> {
    assertIsWorkspaceOwner(access);
    const organizationId = requireOrganizationId(access);
    const [organization, privacy, members, templates, sessions, reports] = await Promise.all([
      this.getWorkspace(access),
      this.getPrivacySummary(access),
      this.listMembers(access),
      this.prisma.assessmentTemplate.findMany({
        relationLoadStrategy: "join",
        where: { organizationId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          roleType: true,
          timeLimitMin: true,
          createdAt: true,
          updatedAt: true,
          modules: {
            select: {
              id: true,
              _count: { select: { questions: true } },
            },
          },
        },
      }),
      this.prisma.interviewSession.findMany({
        relationLoadStrategy: "join",
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          templateId: true,
          status: true,
          accessCode: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          candidate: { select: { name: true, email: true } },
          template: { select: { title: true } },
        },
      }),
      this.prisma.candidateReport.findMany({
        where: { session: { organizationId } },
        orderBy: { createdAt: "desc" },
        select: {
          sessionId: true,
          overallScore: true,
          summary: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      organization,
      privacy,
      members: members.map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        roleLabel: member.roleLabel,
        organizationId: member.organizationId,
        createdAt: member.createdAt,
      })),
      templates: templates.map((template) => ({
        id: template.id,
        title: template.title,
        description: template.description ?? undefined,
        roleType: template.roleType,
        timeLimitMin: template.timeLimitMin,
        moduleCount: template.modules.length,
        questionCount: template.modules.reduce((sum, module) => sum + module._count.questions, 0),
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      })),
      sessions: sessions.map((session) => ({
        id: session.id,
        title: session.title,
        candidateName: session.candidate?.name,
        candidateEmail: session.candidate?.email,
        templateId: session.templateId,
        templateTitle: session.template?.title,
        status: session.status.toLowerCase(),
        accessCode: session.accessCode,
        startedAt: session.startedAt?.toISOString() ?? null,
        completedAt: session.completedAt?.toISOString() ?? null,
        createdAt: session.createdAt.toISOString(),
      })),
      reports: reports.map((report) => ({
        sessionId: report.sessionId,
        overallScore: report.overallScore,
        summary: report.summary,
        createdAt: report.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Permanently removes operational workspace data (templates, sessions, invites).
   * Keeps the organization and owner/interviewer accounts so the owner can continue using Evalora.
   */
  async deleteWorkspaceData(access: AccessContext, input: { confirmName?: string }): Promise<DeleteWorkspaceDataResult> {
    assertIsWorkspaceOwner(access);
    const organizationId = requireOrganizationId(access);
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });
    if (!organization) throw new NotFoundException("Workspace not found.");

    const confirmName = requireNonEmpty(input.confirmName, "Type the organization name to confirm deletion.");
    if (confirmName !== organization.name) {
      throw new BadRequestException("Confirmation name does not match the organization name.");
    }

    const [sessionCount, templateCount, inviteCount] = await Promise.all([
      this.prisma.interviewSession.count({ where: { organizationId } }),
      this.prisma.assessmentTemplate.count({ where: { organizationId } }),
      this.prisma.organizationInvite.count({ where: { organizationId } }),
    ]);

    await this.prisma.$transaction(async (tx) => {
      // Sessions first (responses/messages/submissions/evaluations/reports cascade from session).
      await tx.interviewSession.deleteMany({ where: { organizationId } });
      // Templates cascade modules/questions.
      await tx.assessmentTemplate.deleteMany({ where: { organizationId } });
      // Drafts hold the text of uploaded job descriptions, so a wipe must take
      // them too — otherwise the most sensitive thing the workspace uploaded is
      // the one thing that survives "delete all my data".
      await tx.assessmentTemplateDraft.deleteMany({ where: { organizationId } });
      await tx.organizationInvite.deleteMany({ where: { organizationId } });
    });

    return {
      deleted: true,
      organizationId,
      deletedTemplates: templateCount,
      deletedSessions: sessionCount,
      deletedInvites: inviteCount,
      message: `Deleted ${sessionCount} session(s), ${templateCount} template(s), and ${inviteCount} invite(s). Workspace account retained.`,
    };
  }

  async listMembers(access: AccessContext, currentUserId?: string): Promise<WorkspaceMemberDto[]> {
    const organizationId = requireOrganizationId(access);
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        role: { in: ["ORGANIZATION", "INTERVIEWER"] },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      take: DEFAULT_LIST_LIMIT,
      select: {
        id: true,
        name: true,
        email: true,
        profilePhoto: true,
        role: true,
        organizationId: true,
        createdAt: true,
      },
    });

    const members = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: fromPrismaRole(user.role),
      roleLabel: roleLabel(fromPrismaRole(user.role)),
      organizationId: user.organizationId ?? undefined,
      createdAt: user.createdAt.toISOString(),
      isCurrentUser: currentUserId ? user.id === currentUserId : false,
      ...(user.profilePhoto ? { profilePhoto: user.profilePhoto } : {}),
    }));

    return members.sort((a, b) => {
      const rank = (role: UserRole) => (role === "organization" ? 0 : role === "interviewer" ? 1 : 2);
      return rank(a.role) - rank(b.role) || a.name.localeCompare(b.name);
    });
  }

  async listInvites(access: AccessContext): Promise<WorkspaceInviteDto[]> {
    assertIsWorkspaceOwner(access);
    const organizationId = requireOrganizationId(access);
    await this.expireStaleInvites(organizationId);

    const invites = await this.prisma.organizationInvite.findMany({
      relationLoadStrategy: "join",
      where: { organizationId, status: { in: ["PENDING", "ACCEPTED", "CANCELLED", "EXPIRED"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { invitedBy: { select: { id: true, name: true } } },
    });

    return invites.map(toInviteDto);
  }

  async createInvite(access: AccessContext, input: CreateInviteInput): Promise<WorkspaceInviteDto> {
    assertIsWorkspaceOwner(access);
    const organizationId = requireOrganizationId(access);
    const email = normalizeEmail(requireNonEmpty(input.email, "Email is required."));

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, organizationId: true, role: true },
    });
    // A candidate account is not a workspace member — acceptInvite upgrades it to one, so
    // a candidate email is always invitable regardless of which organization it was created under.
    if (existingUser && existingUser.role !== "CANDIDATE") {
      if (existingUser.organizationId === organizationId) {
        throw new ConflictException("This person is already a member of your workspace.");
      }
      throw new ConflictException("An account with this email already exists. Ask them to use a different work email.");
    }

    await this.expireStaleInvites(organizationId);

    const pending = await this.prisma.organizationInvite.findFirst({
      where: { organizationId, email, status: "PENDING", expiresAt: { gt: new Date() } },
    });
    if (pending) {
      throw new ConflictException("A pending invitation already exists for this email.");
    }

    const invite = await this.prisma.organizationInvite.create({
      data: {
        organizationId,
        email,
        role: "INTERVIEWER",
        token: createInviteToken(),
        invitedById: access.userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        status: "PENDING",
      },
      include: { invitedBy: { select: { id: true, name: true } } },
    });

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });

    const inviteUrlPath = `/invite/${invite.token}`;
    const inviteUrl = this.emailService?.buildInviteUrl(invite.token) ?? inviteUrlPath;

    // Do not block the HTTP response on SMTP/API latency (often 1–4s).
    const emailDelivery = queueEmailDelivery(() =>
      this.emailService
        ? this.emailService.sendWorkspaceInvite({
            to: email,
            organizationName: organization?.name ?? "Evalora workspace",
            inviterName: invite.invitedBy?.name,
            inviteUrl,
            expiresAt: invite.expiresAt,
          })
        : Promise.resolve({
            status: "skipped" as const,
            reason: "Email service unavailable. Share the invite link manually.",
          }),
    );

    return {
      ...toInviteDto(invite),
      inviteUrl,
      emailDelivery,
    };
  }

  async cancelInvite(access: AccessContext, inviteId: string): Promise<{ id: string; cancelled: boolean }> {
    assertIsWorkspaceOwner(access);
    const organizationId = requireOrganizationId(access);

    const invite = await this.prisma.organizationInvite.findFirst({
      where: { id: inviteId, organizationId },
    });
    if (!invite) throw new NotFoundException("Invitation not found.");
    if (invite.status !== "PENDING") {
      throw new BadRequestException("Only pending invitations can be cancelled.");
    }

    await this.prisma.organizationInvite.update({
      where: { id: invite.id },
      data: { status: "CANCELLED" },
    });
    return { id: invite.id, cancelled: true };
  }

  async getInvitePreview(token: string): Promise<InvitePreviewDto> {
    const invite = await this.findActiveInviteByToken(token);
    const organization = await this.prisma.organization.findUnique({
      where: { id: invite.organizationId },
      select: { name: true },
    });
    const inviter = await this.prisma.user.findUnique({
      where: { id: invite.invitedById },
      select: { name: true },
    });

    return {
      email: invite.email,
      organizationName: organization?.name ?? "Evalora workspace",
      role: fromPrismaRole(invite.role),
      roleLabel: roleLabel(fromPrismaRole(invite.role)),
      expiresAt: invite.expiresAt.toISOString(),
      inviterName: inviter?.name,
    };
  }

  async acceptInvite(input: AcceptInviteInput): Promise<{
    token: string;
    user: { id: string; name: string; email: string; role: UserRole; organizationId?: string };
    message: string;
  }> {
    const inviteToken = requireNonEmpty(input.token, "Invite token is required.");
    const name = requireNonEmpty(input.name, "Name is required.");
    const password = requirePassword(input.password);
    const invite = await this.findActiveInviteByToken(inviteToken);

    const existingUser = await this.prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true, organizationId: true, role: true },
    });
    if (existingUser && existingUser.role !== "CANDIDATE") {
      throw new ConflictException("An account with this email already exists. Sign in instead.");
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      // A candidate account is upgraded in place to a workspace member rather than
      // creating a second row — email is a single global identity across roles.
      const select = { id: true, name: true, email: true, role: true, organizationId: true } as const;
      const memberData = {
        name,
        emailVerified: true,
        passwordHash,
        role: "INTERVIEWER" as const,
        organizationId: invite.organizationId,
      };
      const upgraded = existingUser
        ? await tx.user.update({ where: { id: existingUser.id }, data: memberData, select })
        : await tx.user.create({ data: { ...memberData, email: invite.email }, select });

      await tx.organizationInvite.update({
        where: { id: invite.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });

      return upgraded;
    });

    // Sign JWT via a lightweight path — OrganizationService should not depend on AuthService circularly.
    // Caller controller will use AuthService or we sign here. Prefer returning user and let controller login-like sign.
    return {
      token: "", // filled by controller via AuthService helper if available
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: fromPrismaRole(user.role),
        organizationId: user.organizationId ?? undefined,
      },
      message: "Invitation accepted. Welcome to the workspace.",
    };
  }

  async removeMember(access: AccessContext, memberId: string): Promise<{ id: string; removed: boolean }> {
    assertIsWorkspaceOwner(access);
    const organizationId = requireOrganizationId(access);

    if (memberId === access.userId) {
      throw new BadRequestException("You cannot remove yourself from the workspace.");
    }

    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId },
      select: { id: true, role: true },
    });
    if (!member) throw new NotFoundException("Member not found.");
    if (member.role === "ORGANIZATION") {
      throw new ForbiddenException("The workspace owner cannot be removed.");
    }
    if (member.role !== "INTERVIEWER") {
      throw new BadRequestException("Only interviewers can be removed from the workspace.");
    }

    // Detach rather than delete history: keep user row for audit of created sessions/templates.
    await this.prisma.user.update({
      where: { id: member.id },
      data: { organizationId: null },
    });

    return { id: member.id, removed: true };
  }

  private async findActiveInviteByToken(token: string) {
    const invite = await this.prisma.organizationInvite.findUnique({ where: { token } });
    if (!invite) throw new NotFoundException("Invitation not found.");
    if (invite.status === "CANCELLED") throw new GoneException("This invitation was cancelled.");
    if (invite.status === "ACCEPTED") throw new GoneException("This invitation has already been used.");
    if (invite.status === "EXPIRED" || invite.expiresAt.getTime() <= Date.now()) {
      if (invite.status === "PENDING") {
        await this.prisma.organizationInvite.update({
          where: { id: invite.id },
          data: { status: "EXPIRED" },
        });
      }
      throw new GoneException("This invitation has expired. Ask the workspace owner to send a new invite.");
    }
    if (invite.status !== "PENDING") throw new GoneException("This invitation is no longer valid.");
    return invite;
  }

  private async expireStaleInvites(organizationId: string) {
    await this.prisma.organizationInvite.updateMany({
      where: { organizationId, status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });
  }
}

function queueEmailDelivery(send: () => Promise<EmailDeliveryResult>): EmailDeliveryResult {
  void send().catch(() => undefined);
  return {
    status: "queued",
    reason: "Email is being sent in the background. You can also copy the link below.",
  };
}

function toInviteDto(invite: {
  id: string;
  email: string;
  role: "ADMIN" | "ORGANIZATION" | "INTERVIEWER" | "CANDIDATE";
  status: "PENDING" | "ACCEPTED" | "CANCELLED" | "EXPIRED";
  token: string;
  expiresAt: Date;
  createdAt: Date;
  acceptedAt?: Date | null;
  invitedBy?: { id: string; name: string } | null;
}): WorkspaceInviteDto {
  return {
    id: invite.id,
    email: invite.email,
    role: fromPrismaRole(invite.role),
    status: invite.status.toLowerCase() as WorkspaceInviteDto["status"],
    token: invite.token,
    inviteUrlPath: `/invite/${invite.token}`,
    invitedBy: invite.invitedBy ? { id: invite.invitedBy.id, name: invite.invitedBy.name } : undefined,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
    acceptedAt: invite.acceptedAt?.toISOString(),
  };
}

function createInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

function fromPrismaRole(role: string): UserRole {
  return role.toLowerCase() as UserRole;
}

function roleLabel(role: UserRole): string {
  if (role === "organization") return "Owner";
  if (role === "interviewer") return "Interviewer";
  if (role === "admin") return "Platform admin";
  return role;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function requireNonEmpty(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new BadRequestException(message);
  return trimmed;
}

function requirePassword(value: string | undefined): string {
  requireNonEmpty(value, "Password is required.");
  try {
    return assertPasswordPolicy(value);
  } catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : "Password does not meet requirements.");
  }
}
