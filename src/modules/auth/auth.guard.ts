import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import * as jwt from "jsonwebtoken";
import type { UserRole } from "../../domain/evalora.types";

const DEFAULT_JWT_SECRET = "evalora-development-secret-change-me";
export const ROLES_KEY = "roles";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  organizationId?: string;
}

export interface AuthenticatedRequest {
  headers: { authorization?: string | string[] };
  user?: AuthenticatedUser;
}

interface JwtRolePayload {
  sub?: string;
  id?: string;
  email?: string;
  role?: string;
  organizationId?: string;
  orgId?: string;
}

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = extractAuthUserFromHeader(request.headers.authorization);
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]) ?? [];
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    assertRoleAccess(request.user, roles);
    return true;
  }
}

export function extractAuthUserFromHeader(authorization: string | string[] | undefined, jwtSecret = getJwtSecret()): AuthenticatedUser {
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedException("Authentication required.");
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw new UnauthorizedException("Authentication required.");
  }

  try {
    const payload = jwt.verify(token, jwtSecret) as JwtRolePayload;
    const id = payload.sub ?? payload.id;
    if (!id || !payload.email || !isUserRole(payload.role)) {
      throw new Error("Invalid token payload.");
    }

    const organizationId = payload.organizationId ?? payload.orgId;
    return organizationId ? { id, email: payload.email, role: payload.role, organizationId } : { id, email: payload.email, role: payload.role };
  } catch {
    throw new UnauthorizedException("Authentication required.");
  }
}

export function assertRoleAccess(user: AuthenticatedUser | undefined, allowedRoles: UserRole[]): void {
  if (!allowedRoles.length) return;
  if (!user) throw new UnauthorizedException("Authentication required.");
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenException("You do not have permission to access this resource.");
  }
}

function getJwtSecret(): string {
  return process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
}

function isUserRole(role: string | undefined): role is UserRole {
  return role === "admin" || role === "organization" || role === "interviewer" || role === "candidate";
}
