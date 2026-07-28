import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import * as jwt from "jsonwebtoken";
import type { UserRole } from "../../domain/evalora.types";

const DEFAULT_JWT_SECRET = "evalora-development-secret-change-me";
export const ROLES_KEY = "roles";

/**
 * Every JWT this API signs is scoped to exactly one job, and the scope is
 * checked on the way in — not just written on the way out. REST accepts only a
 * session token; the realtime handshake accepts only a realtime ticket. Without
 * this check the 60s ticket that is deliberately handed to browser JavaScript
 * would work as a bearer token on every REST endpoint, which defeats the whole
 * reason the session itself is kept in a cookie the page cannot read.
 *
 * A token with no `purpose` claim counts as a session token so that session
 * cookies issued before purposes existed keep working until they expire —
 * nobody is signed out by this change.
 */
export const TOKEN_PURPOSES = {
  session: "session",
  realtimeTicket: "realtime",
  passwordReset: "password_reset",
  emailVerification: "email_verification",
} as const;

export type TokenPurpose = (typeof TOKEN_PURPOSES)[keyof typeof TOKEN_PURPOSES];

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
  purpose?: string;
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
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]) ?? [];
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    assertRoleAccess(request.user, roles);
    return true;
  }
}

export function extractAuthUserFromHeader(
  authorization: string | string[] | undefined,
  jwtSecret = getJwtSecret(),
  expectedPurpose: TokenPurpose = TOKEN_PURPOSES.session,
): AuthenticatedUser {
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedException("Authentication required.");
  }

  return verifyAuthToken(header.slice("Bearer ".length).trim(), jwtSecret, expectedPurpose);
}

/**
 * Soft variant for "who am I" probes (e.g. GET /auth/me). Returns the
 * authenticated user when a valid Bearer token is present, or null otherwise —
 * never throws — so an anonymous session check is a 200, not a noisy 401.
 */
export function tryExtractAuthUserFromHeader(
  authorization: string | string[] | undefined,
  jwtSecret?: string,
  expectedPurpose: TokenPurpose = TOKEN_PURPOSES.session,
): AuthenticatedUser | null {
  try {
    return extractAuthUserFromHeader(authorization, jwtSecret ?? getJwtSecret(), expectedPurpose);
  } catch {
    return null;
  }
}

/**
 * Handshake variant: a WebSocket client carries its credential in the socket.io
 * handshake payload rather than an Authorization header, and presents a token
 * issued for a purpose other than `session`. Never throws, so a bad credential
 * becomes a friendly disconnect instead of an unhandled gateway error.
 */
export function tryExtractAuthUserFromToken(
  token: string,
  expectedPurpose: TokenPurpose,
  jwtSecret?: string,
): AuthenticatedUser | null {
  try {
    return verifyAuthToken(token.trim(), jwtSecret ?? getJwtSecret(), expectedPurpose);
  } catch {
    return null;
  }
}

function verifyAuthToken(token: string, jwtSecret: string, expectedPurpose: TokenPurpose): AuthenticatedUser {
  if (!token) {
    throw new UnauthorizedException("Authentication required.");
  }

  try {
    const payload = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] }) as JwtRolePayload;
    // An absent claim means a session token signed before purposes were issued.
    const purpose = payload.purpose ?? TOKEN_PURPOSES.session;
    if (purpose !== expectedPurpose) {
      throw new Error("Token was issued for a different purpose.");
    }

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
  const configured = process.env.JWT_SECRET?.trim();
  if (configured) return configured;
  // Fail closed: the public dev secret is only used in an explicit local
  // dev/test context. An unset NODE_ENV (e.g. a staging host that forgot to set
  // JWT_SECRET) throws rather than silently signing forgeable tokens.
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") return DEFAULT_JWT_SECRET;
  throw new Error("JWT_SECRET is required. Set it, or set NODE_ENV=development for the local default.");
}

function isUserRole(role: string | undefined): role is UserRole {
  return role === "admin" || role === "organization" || role === "interviewer" || role === "candidate";
}
