import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import * as jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import type { UserRole } from "../../domain/evalora.types";

type PrismaRole = "ADMIN" | "ORGANIZATION" | "INTERVIEWER" | "CANDIDATE";

export interface AuthUserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  organizationId?: string;
}

export interface AuthUserRepository {
  findByEmail(email: string): Promise<AuthUserRecord | null>;
  findById?(id: string): Promise<AuthUserRecord | null>;
  createUser(data: Omit<AuthUserRecord, "id">): Promise<AuthUserRecord>;
  createUserWithWorkspace?(
    data: Omit<AuthUserRecord, "id" | "organizationId">,
    workspaceName: string,
  ): Promise<AuthUserRecord>;
  ensureUserWorkspace?(user: AuthUserRecord, workspaceName: string): Promise<AuthUserRecord>;
}

export interface RegisterInput {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  organizationId?: string;
  organizationName?: string;
}

export interface LoginInput {
  email?: string;
  password?: string;
}

export interface GoogleAuthInput {
  /** Google Identity Services ID token (JWT credential). */
  credential?: string;
  idToken?: string;
  /** Optional workspace name when creating a new owner account. */
  organizationName?: string;
}

export interface AuthResult {
  token: string;
  user: Omit<AuthUserRecord, "passwordHash">;
}

export interface GoogleTokenVerifier {
  verify(idToken: string): Promise<{ email: string; name: string; emailVerified: boolean }>;
}

interface PrismaUserRow {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: PrismaRole;
  organizationId?: string | null;
}

interface PrismaUserClient {
  user: {
    findUnique(args: { where: { email: string } | { id: string }; select: Record<keyof PrismaUserRow, true> }): Promise<PrismaUserRow | null>;
    create(args: {
      data:
        | {
            name: string;
            email: string;
            passwordHash: string;
            role: PrismaRole;
            organizationId?: string;
            organization?: never;
          }
        | {
            name: string;
            email: string;
            passwordHash: string;
            role: PrismaRole;
            organizationId?: never;
            organization: { create: { name: string } };
          };
      select: Record<keyof PrismaUserRow, true>;
    }): Promise<PrismaUserRow>;
    update(args: {
      where: { id: string };
      data: { organizationId: string };
      select: Record<keyof PrismaUserRow, true>;
    }): Promise<PrismaUserRow>;
  };
  organization: {
    create(args: { data: { name: string }; select: { id: true } }): Promise<{ id: string }>;
  };
}

const USER_SELECT: Record<keyof PrismaUserRow, true> = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  role: true,
  organizationId: true,
};

const SALT_ROUNDS = 12;
const DEFAULT_JWT_SECRET = "evalora-development-secret-change-me";

export class PrismaAuthRepository implements AuthUserRepository {
  constructor(private readonly prisma: PrismaUserClient) {}

  async findByEmail(email: string): Promise<AuthUserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: USER_SELECT,
    });

    return user ? toAuthUserRecord(user) : null;
  }

  async findById(id: string): Promise<AuthUserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    return user ? toAuthUserRecord(user) : null;
  }

  async createUser(data: Omit<AuthUserRecord, "id">): Promise<AuthUserRecord> {
    const user = await this.prisma.user.create({
      data: {
        name: data.name.trim(),
        email: normalizeEmail(data.email),
        passwordHash: data.passwordHash,
        role: toPrismaRole(data.role),
        organizationId: data.organizationId,
      },
      select: USER_SELECT,
    });

    return toAuthUserRecord(user);
  }

  async createUserWithWorkspace(
    data: Omit<AuthUserRecord, "id" | "organizationId">,
    workspaceName: string,
  ): Promise<AuthUserRecord> {
    const user = await this.prisma.user.create({
      data: {
        name: data.name.trim(),
        email: normalizeEmail(data.email),
        passwordHash: data.passwordHash,
        role: toPrismaRole(data.role),
        organization: { create: { name: workspaceName } },
      },
      select: USER_SELECT,
    });

    return toAuthUserRecord(user);
  }

  async ensureUserWorkspace(user: AuthUserRecord, workspaceName: string): Promise<AuthUserRecord> {
    if (user.organizationId || user.role === "admin" || user.role === "candidate") return user;

    const organization = await this.prisma.organization.create({
      data: { name: workspaceName },
      select: { id: true },
    });
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { organizationId: organization.id },
      select: USER_SELECT,
    });

    return toAuthUserRecord(updatedUser);
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: AuthUserRepository,
    private readonly jwtSecret = resolveJwtSecret(),
    private readonly googleVerifier: GoogleTokenVerifier | null = createGoogleTokenVerifierFromEnv(),
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const name = requireNonEmpty(input.name, "Name is required.");
    const email = normalizeEmail(requireNonEmpty(input.email, "Email is required."));
    const password = requirePassword(input.password);
    const role = resolvePublicRegistrationRole(input.role);
    if (input.organizationId?.trim()) {
      throw new Error("Organization membership cannot be selected during public registration.");
    }

    const existingUser = await this.users.findByEmail(email);
    if (existingUser) {
      throw new Error("Unable to complete registration. Please try again.");
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userData = { name, email, passwordHash, role };
    const user = this.users.createUserWithWorkspace
      ? await this.users.createUserWithWorkspace(userData, workspaceName(input.organizationName, name))
      : await this.users.createUser(userData);
    return this.toAuthResult(user);
  }

  async getCurrentUser(id: string): Promise<Omit<AuthUserRecord, "passwordHash">> {
    if (!this.users.findById) throw new Error("User lookup is unavailable.");
    const user = await this.users.findById(id);
    if (!user || user.role === "candidate") throw new Error("User account is unavailable.");
    return stripPasswordHash(user);
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = normalizeEmail(requireNonEmpty(input.email, "Email is required."));
    const password = requireNonEmpty(input.password, "Password is required.");
    let user = await this.users.findByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new Error("Invalid email or password.");
    }
    if (user.role === "candidate") {
      throw new Error("Candidates access assessments through an invitation link or access code.");
    }

    if (!user.organizationId && user.role !== "admin" && this.users.ensureUserWorkspace) {
      user = await this.users.ensureUserWorkspace(user, workspaceName(undefined, user.name));
    }

    return this.toAuthResult(user);
  }

  /**
   * Sign in or create a workspace owner from a verified Google ID token.
   * Existing interviewer/owner accounts are logged in; new emails create an organization workspace.
   */
  async loginWithGoogle(input: GoogleAuthInput): Promise<AuthResult> {
    if (!this.googleVerifier) {
      throw new Error("Google sign-in is not configured. Set GOOGLE_CLIENT_ID on the API.");
    }

    const idToken = requireNonEmpty(input.credential ?? input.idToken, "Google credential is required.");
    const profile = await this.googleVerifier.verify(idToken);
    if (!profile.emailVerified) {
      throw new Error("Google account email is not verified.");
    }

    const email = normalizeEmail(profile.email);
    const name = profile.name.trim() || email.split("@")[0] || "Google User";
    let user = await this.users.findByEmail(email);

    if (user) {
      if (user.role === "candidate") {
        throw new Error("This email is registered as a candidate invitation. Use a different Google account for workspace access.");
      }
      if (user.role === "admin") {
        return this.toAuthResult(user);
      }
      if (!user.organizationId && this.users.ensureUserWorkspace) {
        user = await this.users.ensureUserWorkspace(user, workspaceName(input.organizationName, user.name));
      }
      return this.toAuthResult(user);
    }

    // New Google user → workspace owner (same as public register).
    const passwordHash = await bcrypt.hash(`google-oauth:${randomBytes(32).toString("hex")}`, SALT_ROUNDS);
    const userData = {
      name,
      email,
      passwordHash,
      role: "organization" as UserRole,
    };
    user = this.users.createUserWithWorkspace
      ? await this.users.createUserWithWorkspace(userData, workspaceName(input.organizationName, name))
      : await this.users.createUser(userData);

    return this.toAuthResult(user);
  }

  private toAuthResult(user: AuthUserRecord): AuthResult {
    const safeUser = stripPasswordHash(user);
    return {
      token: jwt.sign(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
        },
        this.jwtSecret,
        { expiresIn: "1d" },
      ),
      user: safeUser,
    };
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function requireNonEmpty(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function requirePassword(value: string | undefined): string {
  const password = requireNonEmpty(value, "Password is required.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (password.length > 128) throw new Error("Password must be at most 128 characters.");
  return password;
}

function workspaceName(requestedName: string | undefined, userName: string): string {
  const normalized = requestedName?.trim();
  return normalized ? normalized.slice(0, 120) : `${userName.trim().slice(0, 96)}'s workspace`;
}

function resolveJwtSecret(): string {
  const configured = process.env.JWT_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET is required in production.");
  return DEFAULT_JWT_SECRET;
}

function resolvePublicRegistrationRole(role: UserRole | undefined): UserRole {
  // First public signup is always the workspace owner (`organization`).
  // Interviewers join later via invite — not public registration.
  if (!role || role === "organization" || role === "interviewer") return "organization";
  if (role === "admin") {
    throw new Error("Platform admin accounts are not created through public registration.");
  }
  throw new Error("Candidates access assessments through invitation links or access codes, not platform registration.");
}

function stripPasswordHash(user: AuthUserRecord): Omit<AuthUserRecord, "passwordHash"> {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  };
}

function toPrismaRole(role: UserRole): PrismaRole {
  switch (role) {
    case "admin":
      return "ADMIN";
    case "organization":
      return "ORGANIZATION";
    case "interviewer":
      return "INTERVIEWER";
    default:
      return "CANDIDATE";
  }
}

function fromPrismaRole(role: PrismaRole): UserRole {
  return role.toLowerCase() as UserRole;
}

function toAuthUserRecord(user: PrismaUserRow): AuthUserRecord {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    passwordHash: user.passwordHash,
    role: fromPrismaRole(user.role),
    organizationId: user.organizationId ?? undefined,
  };
}

export function createGoogleTokenVerifierFromEnv(): GoogleTokenVerifier | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) return null;
  const client = new OAuth2Client(clientId);
  return {
    async verify(idToken: string) {
      try {
        const ticket = await client.verifyIdToken({
          idToken,
          audience: clientId,
        });
        const payload = ticket.getPayload();
        if (!payload?.email) throw new Error("Google token is missing an email claim.");
        return {
          email: payload.email,
          name: payload.name?.trim() || payload.email.split("@")[0] || "Google User",
          emailVerified: payload.email_verified === true,
        };
      } catch (error) {
        if (error instanceof Error && /missing an email|not verified/i.test(error.message)) throw error;
        throw new Error("Invalid or expired Google sign-in token.");
      }
    },
  };
}
