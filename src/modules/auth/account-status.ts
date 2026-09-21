import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { UserRole } from "../../domain/evalora.types";
import type { AuthenticatedUser } from "./auth.guard";

export const ACCOUNT_SUSPENDED_MESSAGE = "This account has been suspended by platform administration.";
export const WORKSPACE_SUSPENDED_MESSAGE = "Your workspace has been suspended by platform administration.";

type PrismaRole = "ADMIN" | "ORGANIZATION" | "INTERVIEWER" | "CANDIDATE";

/** The columns the guard needs to decide whether a token holder may act right now. */
export const ACCOUNT_STATUS_SELECT = {
  id: true,
  email: true,
  role: true,
  organizationId: true,
  isSuspended: true,
  organization: { select: { isSuspended: true } },
} as const;

export interface AccountStatusRow {
  id: string;
  email: string;
  role: PrismaRole;
  organizationId: string | null;
  isSuspended: boolean;
  organization: { isSuspended: boolean } | null;
}

export interface AccountStatusClient {
  user: {
    findUnique(args: { where: { id: string }; select: typeof ACCOUNT_STATUS_SELECT }): PromiseLike<AccountStatusRow | null>;
  };
}

/**
 * Platform admins are never locked out by a workspace-level suspension: the
 * admin who suspends a workspace may be a member of it, and the platform must
 * always keep at least one operator who can reverse the action.
 */
export function assertAccountActive(account: {
  role: PrismaRole | UserRole;
  isSuspended?: boolean;
  organization?: { isSuspended: boolean } | null;
  workspaceSuspended?: boolean;
}): void {
  if (account.isSuspended) throw new ForbiddenException(ACCOUNT_SUSPENDED_MESSAGE);
  const isAdmin = account.role === "ADMIN" || account.role === "admin";
  const workspaceSuspended = account.workspaceSuspended ?? account.organization?.isSuspended ?? false;
  if (!isAdmin && workspaceSuspended) throw new ForbiddenException(WORKSPACE_SUSPENDED_MESSAGE);
}

/**
 * Turns a verified token into the user as the database knows them *now*.
 *
 * The JWT proves identity; it does not get to assert privileges that an admin
 * may have revoked since it was signed. Role, workspace, and suspension are
 * therefore re-read on every authenticated request, which is what makes a
 * suspension or a role change bite on the target's very next call instead of
 * whenever their token happens to expire. A token whose account no longer
 * exists is treated as unauthenticated rather than as a ghost with old claims.
 */
export async function resolveActiveUser(client: AccountStatusClient, tokenUser: AuthenticatedUser): Promise<AuthenticatedUser> {
  const account = await client.user.findUnique({ where: { id: tokenUser.id }, select: ACCOUNT_STATUS_SELECT });
  if (!account) throw new UnauthorizedException("Authentication required.");
  assertAccountActive(account);
  const role = account.role.toLowerCase() as UserRole;
  return account.organizationId
    ? { id: account.id, email: account.email, role, organizationId: account.organizationId }
    : { id: account.id, email: account.email, role };
}
