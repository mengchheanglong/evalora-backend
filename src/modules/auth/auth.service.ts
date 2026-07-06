import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import type { UserRole } from "../../domain/evalora.types";

type PrismaRole = "ADMIN" | "ORGANIZATION" | "INTERVIEWER" | "CANDIDATE";

export interface AuthUserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

export interface AuthUserRepository {
  findByEmail(email: string): Promise<AuthUserRecord | null>;
  createUser(data: Omit<AuthUserRecord, "id">): Promise<AuthUserRecord>;
}

export interface RegisterInput {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
}

export interface LoginInput {
  email?: string;
  password?: string;
}

export interface AuthResult {
  token: string;
  user: Omit<AuthUserRecord, "passwordHash">;
}

interface PrismaUserRow {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: PrismaRole;
}

interface PrismaUserClient {
  user: {
    findUnique(args: { where: { email: string }; select: Record<keyof PrismaUserRow, true> }): Promise<PrismaUserRow | null>;
    create(args: { data: { name: string; email: string; passwordHash: string; role: PrismaRole }; select: Record<keyof PrismaUserRow, true> }): Promise<PrismaUserRow>;
  };
}

const USER_SELECT: Record<keyof PrismaUserRow, true> = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  role: true,
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

  async createUser(data: Omit<AuthUserRecord, "id">): Promise<AuthUserRecord> {
    const user = await this.prisma.user.create({
      data: {
        name: data.name.trim(),
        email: normalizeEmail(data.email),
        passwordHash: data.passwordHash,
        role: toPrismaRole(data.role),
      },
      select: USER_SELECT,
    });

    return toAuthUserRecord(user);
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: AuthUserRepository,
    private readonly jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const name = requireNonEmpty(input.name, "Name is required.");
    const email = normalizeEmail(requireNonEmpty(input.email, "Email is required."));
    const password = requirePassword(input.password);
    const role = input.role ?? "candidate";

    const existingUser = await this.users.findByEmail(email);
    if (existingUser) {
      throw new Error("Unable to complete registration. Please try again.");
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.users.createUser({ name, email, passwordHash, role });
    return this.toAuthResult(user);
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = normalizeEmail(requireNonEmpty(input.email, "Email is required."));
    const password = requireNonEmpty(input.password, "Password is required.");
    const user = await this.users.findByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new Error("Invalid email or password.");
    }

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

function stripPasswordHash(user: AuthUserRecord): Omit<AuthUserRecord, "passwordHash"> {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
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
  };
}
