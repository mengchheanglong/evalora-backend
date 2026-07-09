import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { UserRole } from "../../domain/evalora.types";
import type { AuthenticatedUser } from "./auth.guard";

export interface AccessContext {
  userId: string;
  role: UserRole;
  organizationId?: string;
}

const NO_ACCESS_ID = "__evalora_no_access__";

export function toAccessContext(user: AuthenticatedUser | undefined): AccessContext {
  if (!user) throw new UnauthorizedException("Authentication required.");
  return {
    userId: user.id,
    role: user.role,
    organizationId: user.organizationId,
  };
}

export function buildTemplateOwnershipWhere(access?: AccessContext): Record<string, unknown> {
  if (!access || access.role === "admin") return {};
  if (access.role === "organization" || access.role === "interviewer") {
    return { organizationId: requireOrganizationId(access) };
  }
  return { id: NO_ACCESS_ID };
}

export function buildSessionOwnershipWhere(access?: AccessContext): Record<string, unknown> {
  if (!access || access.role === "admin") return {};
  if (access.role === "candidate") return { candidateId: access.userId };
  return { organizationId: requireOrganizationId(access) };
}

export function mergeWhere(...parts: Array<Record<string, unknown> | undefined>): Record<string, unknown> | undefined {
  const where = Object.assign({}, ...parts.filter(Boolean));
  return Object.keys(where).length ? where : undefined;
}

export function requireOrganizationId(access: AccessContext): string {
  if (!access.organizationId) {
    throw new ForbiddenException("Organization membership is required to access this resource.");
  }
  return access.organizationId;
}

export function assertCanWriteOrganizationResource(access: AccessContext | undefined): void {
  if (!access || access.role === "admin" || access.role === "organization" || access.role === "interviewer") return;
  throw new ForbiddenException("You do not have permission to modify this resource.");
}

export function forbiddenResourceError(resource = "Resource"): ForbiddenException {
  return new ForbiddenException(`${resource} not found or access denied.`);
}
