import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import * as jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import type { UserRole } from "../../domain/evalora.types";
import { TOKEN_PURPOSES } from "./auth.guard";
import { assertPasswordPolicy, PASSWORD_MAX_LENGTH } from "./password-policy";

type PrismaRole = "ADMIN" | "ORGANIZATION" | "INTERVIEWER" | "CANDIDATE";

export interface AuthUserRecord {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  passwordHash: string;
  profilePhoto?: string;
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
  updatePasswordHash?(userId: string, passwordHash: string): Promise<AuthUserRecord>;
  updateName?(userId: string, name: string): Promise<AuthUserRecord>;
  updateProfile?(userId: string, input: { name?: string; profilePhoto?: string | null }): Promise<AuthUserRecord>;
  markEmailVerified?(userId: string): Promise<AuthUserRecord>;
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
  remember?: boolean;
}

export interface GoogleAuthInput {
  /** Google Identity Services ID token (JWT credential). */
  credential?: string;
  idToken?: string;
  /** Optional workspace name when creating a new owner account. */
  organizationName?: string;
  /** Keep the workspace session available after the browser closes. */
  remember?: boolean;
}

export interface AuthResult {
  token: string;
  user: Omit<AuthUserRecord, "passwordHash">;
}

export interface RegistrationResult {
  message: string;
  email: string;
  requiresEmailVerification: true;
  emailDelivery: {
    status: "sent" | "skipped" | "failed" | "queued";
    reason?: string;
  };
  /** Development fallback when no email provider could deliver the link. */
  verificationUrl?: string;
}

export interface ResendEmailVerificationResult {
  message: string;
  emailDelivery: RegistrationResult["emailDelivery"];
  /** Development fallback when no email provider could deliver the link. */
  verificationUrl?: string;
}

export interface GoogleTokenVerifier {
  verify(idToken: string): Promise<{ email: string; name: string; emailVerified: boolean }>;
}

interface PrismaUserRow {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  passwordHash: string;
  profilePhoto?: string | null;
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
            emailVerified: boolean;
            passwordHash: string;
            role: PrismaRole;
            organizationId?: string;
            organization?: never;
          }
        | {
            name: string;
            email: string;
            emailVerified: boolean;
            passwordHash: string;
            role: PrismaRole;
            organizationId?: never;
            organization: { create: { name: string } };
          };
      select: Record<keyof PrismaUserRow, true>;
    }): Promise<PrismaUserRow>;
    update(args: {
      where: { id: string };
      data: { organizationId?: string; passwordHash?: string; name?: string; profilePhoto?: string | null; emailVerified?: boolean };
      select: Record<keyof PrismaUserRow, true>;
    }): Promise<PrismaUserRow>;
  };
  organization: {
    create(args: { data: { name: string }; select: { id: true } }): Promise<{ id: string }>;
  };
}

export interface PasswordResetRequestResult {
  message: string;
  emailDelivery: {
    status: "sent" | "skipped" | "failed" | "queued";
    reason?: string;
    provider?: string;
  };
  /** Present when a matching workspace account exists and email could not be sent (local demos). */
  resetUrl?: string;
}

export interface PasswordResetConfirmResult {
  message: string;
}

// Purposes live in auth.guard.ts because that is where they are enforced; a
// token is only ever as safe as the check on the reading side.
export const REALTIME_TICKET_PURPOSE = TOKEN_PURPOSES.realtimeTicket;
const REALTIME_TICKET_TTL = "60s";
const PASSWORD_RESET_TTL = "1h";
const EMAIL_VERIFICATION_TTL = "15m";
const EMAIL_VERIFICATION_RESEND_MESSAGE = "If this email still needs verification, a new link has been sent.";
const PASSWORD_RESET_GENERIC_MESSAGE =
  "If an account exists for that email, password reset instructions have been sent.";
const EMAIL_NOT_CONFIGURED_REASON = "Email is not configured. Share the reset link manually.";
const VERIFICATION_EMAIL_NOT_CONFIGURED_REASON = "Email is not configured. Configure Gmail SMTP or Resend, then try again.";

const USER_SELECT: Record<keyof PrismaUserRow, true> = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  passwordHash: true,
  profilePhoto: true,
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
        emailVerified: data.emailVerified,
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
        emailVerified: data.emailVerified,
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

  async updatePasswordHash(userId: string, passwordHash: string): Promise<AuthUserRecord> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
      select: USER_SELECT,
    });
    return toAuthUserRecord(user);
  }

  async updateName(userId: string, name: string): Promise<AuthUserRecord> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name },
      select: USER_SELECT,
    });
    return toAuthUserRecord(user);
  }

  async updateProfile(userId: string, input: { name?: string; profilePhoto?: string | null }): Promise<AuthUserRecord> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: input,
      select: USER_SELECT,
    });
    return toAuthUserRecord(user);
  }

  async markEmailVerified(userId: string): Promise<AuthUserRecord> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
      select: USER_SELECT,
    });
    return toAuthUserRecord(user);
  }
}

export interface AuthEmailSender {
  isConfigured: boolean;
  buildPasswordResetUrl(token: string): string;
  buildEmailVerificationUrl?(token: string): string;
  sendEmailVerification?(input: {
    to: string;
    userName: string;
    verificationUrl: string;
    expiresInLabel: string;
  }): Promise<{ status: "sent" | "skipped" | "failed" | "queued"; reason?: string; provider?: string }>;
  sendPasswordReset(input: {
    to: string;
    userName: string;
    resetUrl: string;
    expiresInLabel: string;
  }): Promise<{ status: "sent" | "skipped" | "failed" | "queued"; reason?: string; provider?: string }>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: AuthUserRepository,
    private readonly jwtSecret = resolveJwtSecret(),
    private readonly googleVerifier: GoogleTokenVerifier | null = createGoogleTokenVerifierFromEnv(),
    private readonly emailService: AuthEmailSender | null = null,
  ) {}

  async register(input: RegisterInput): Promise<RegistrationResult> {
    const name = requireNonEmpty(input.name, "Name is required.", NAME_MAX_LENGTH);
    const email = requireEmail(input.email);
    const password = requirePassword(input.password);
    const role = resolvePublicRegistrationRole(input.role);
    if (input.organizationId?.trim()) {
      throw new Error("Organization membership cannot be selected during public registration.");
    }

    const existingUser = await this.users.findByEmail(email);
    if (existingUser?.emailVerified || existingUser?.role === "candidate") {
      throw new Error("Unable to complete registration. Please try again.");
    }

    let user: AuthUserRecord;
    if (existingUser) {
      // Never let a repeated registration mutate a pending account's credentials.
      // The recipient can use the fresh email link or the password-reset flow.
      user = existingUser;
    } else {
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const userData = { name, email, emailVerified: false, passwordHash, role };
      user = this.users.createUserWithWorkspace
        ? await this.users.createUserWithWorkspace(userData, workspaceName(input.organizationName, name))
        : await this.users.createUser(userData);
    }

    return this.sendEmailVerification(user, "Registration successful. Check your email to activate your workspace.");
  }

  async verifyEmail(input: { token?: string }): Promise<AuthResult> {
    const token = requireNonEmpty(input.token, "Verification token is required.");
    let payload: jwt.JwtPayload;
    try {
      const decoded = jwt.verify(token, this.jwtSecret, { algorithms: ["HS256"] });
      if (typeof decoded === "string") throw new Error("Invalid token payload.");
      payload = decoded;
    } catch {
      throw new Error("This verification link is invalid or has expired.");
    }

    if (payload.purpose !== TOKEN_PURPOSES.emailVerification || typeof payload.sub !== "string" || typeof payload.email !== "string") {
      throw new Error("This verification link is invalid or has expired.");
    }
    if (!this.users.findById || !this.users.markEmailVerified) throw new Error("Email verification is unavailable.");

    const user = await this.users.findById(payload.sub);
    if (
      !user ||
      user.role === "candidate" ||
      user.emailVerified ||
      normalizeEmail(user.email) !== normalizeEmail(payload.email) ||
      payload.ph !== passwordResetFingerprint(user.passwordHash)
    ) {
      throw new Error("This verification link is invalid or has expired.");
    }

    const verifiedUser = await this.users.markEmailVerified(user.id);
    return this.toAuthResult(verifiedUser);
  }

  async resendEmailVerification(input: { email?: string }): Promise<ResendEmailVerificationResult> {
    const email = requireEmail(input.email);
    const user = await this.users.findByEmail(email);
    if (!user || user.emailVerified || user.role === "candidate") {
      return {
        message: EMAIL_VERIFICATION_RESEND_MESSAGE,
        emailDelivery: {
          status: this.emailService?.isConfigured ? "sent" : "skipped",
          reason: this.emailService?.isConfigured ? undefined : VERIFICATION_EMAIL_NOT_CONFIGURED_REASON,
        },
      };
    }

    const result = await this.sendEmailVerification(user, EMAIL_VERIFICATION_RESEND_MESSAGE);
    return {
      message: EMAIL_VERIFICATION_RESEND_MESSAGE,
      emailDelivery: result.emailDelivery,
      verificationUrl: result.verificationUrl,
    };
  }

  async getCurrentUser(id: string): Promise<Omit<AuthUserRecord, "passwordHash">> {
    if (!this.users.findById) throw new Error("User lookup is unavailable.");
    const user = await this.users.findById(id);
    if (!user || user.role === "candidate") throw new Error("User account is unavailable.");
    return stripPasswordHash(user);
  }

  async updateCurrentUser(id: string, input: { name?: string; profilePhoto?: string | null }): Promise<Omit<AuthUserRecord, "passwordHash">> {
    const hasName = input.name !== undefined;
    const hasPhoto = Object.prototype.hasOwnProperty.call(input, "profilePhoto");
    if (!hasName && !hasPhoto) throw new Error("Provide a profile change.");

    const name = hasName ? requireNonEmpty(input.name, "Name is required.", NAME_MAX_LENGTH) : undefined;
    const profilePhoto = hasPhoto ? normalizeProfilePhoto(input.profilePhoto) : undefined;
    let user: AuthUserRecord;
    if (this.users.updateProfile) {
      user = await this.users.updateProfile(id, { name, profilePhoto });
    } else if (name !== undefined && profilePhoto === undefined && this.users.updateName) {
      user = await this.users.updateName(id, name);
    } else {
      throw new Error("Profile updates are unavailable.");
    }
    if (user.role === "candidate") throw new Error("User account is unavailable.");
    return stripPasswordHash(user);
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = requireEmail(input.email);
    const password = requireNonEmpty(input.password, "Password is required.", PASSWORD_MAX_LENGTH);
    let user = await this.users.findByEmail(email);

    // Always run a bcrypt comparison — even when the account is missing — so the
    // response time does not reveal whether an email is registered (enumeration).
    const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !passwordMatches) {
      throw new Error("Invalid email or password.");
    }
    if (user.role === "candidate") {
      throw new Error("Candidates access assessments through an invitation link or access code.");
    }
    if (!user.emailVerified) {
      throw new EmailVerificationRequiredError();
    }

    if (!user.organizationId && user.role !== "admin" && this.users.ensureUserWorkspace) {
      user = await this.users.ensureUserWorkspace(user, workspaceName(undefined, user.name));
    }

    return this.toAuthResult(user, input.remember === true);
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
      if (!user.emailVerified) {
        if (!this.users.markEmailVerified) throw new Error("Email verification is unavailable.");
        user = await this.users.markEmailVerified(user.id);
      }
      if (user.role === "admin") {
        return this.toAuthResult(user, input.remember === true);
      }
      if (!user.organizationId && this.users.ensureUserWorkspace) {
        user = await this.users.ensureUserWorkspace(user, workspaceName(input.organizationName, user.name));
      }
      return this.toAuthResult(user, input.remember === true);
    }

    // New Google user → workspace owner (same as public register).
    const passwordHash = await bcrypt.hash(`google-oauth:${randomBytes(32).toString("hex")}`, SALT_ROUNDS);
    const userData = {
      name,
      email,
      emailVerified: true,
      passwordHash,
      role: "organization" as UserRole,
    };
    user = this.users.createUserWithWorkspace
      ? await this.users.createUserWithWorkspace(userData, workspaceName(input.organizationName, name))
      : await this.users.createUser(userData);

    return this.toAuthResult(user, input.remember === true);
  }

  /**
   * Request a password reset for a workspace account.
   * Always returns a generic success message to avoid account enumeration.
   * When email delivery is unavailable, includes `resetUrl` so local demos still work.
   */
  async requestPasswordReset(input: { email?: string }): Promise<PasswordResetRequestResult> {
    const email = requireEmail(input.email);
    const user = await this.users.findByEmail(email);
    const eligibleUser = user && user.role !== "candidate" && user.emailVerified ? user : null;

    let delivery: { status: "sent" | "skipped" | "failed" | "queued"; reason?: string; provider?: string };
    let resetUrl: string | undefined;

    if (eligibleUser) {
      const token = this.signPasswordResetToken(eligibleUser);
      resetUrl = this.emailService?.buildPasswordResetUrl(token) ?? defaultPasswordResetUrl(token);
      delivery = this.emailService
        ? await this.emailService.sendPasswordReset({
            to: eligibleUser.email,
            userName: eligibleUser.name,
            resetUrl,
            expiresInLabel: "1 hour",
          })
        : { status: "skipped", reason: EMAIL_NOT_CONFIGURED_REASON };
    } else {
      // No eligible account: return the same response shape a real account would,
      // without generating a token, so this endpoint cannot be used to tell which
      // emails are registered (account enumeration).
      delivery = this.emailService ? { status: "sent" } : { status: "skipped", reason: EMAIL_NOT_CONFIGURED_REASON };
    }

    const result: PasswordResetRequestResult = {
      message: PASSWORD_RESET_GENERIC_MESSAGE,
      emailDelivery: {
        status: delivery.status,
        // Only surface a reason that depends on email *configuration* (identical
        // for every caller). Provider-specific send details ("sent via Gmail",
        // messageId, the mail provider name) are withheld because they differ
        // between a real and a non-existent account and would leak which emails
        // are registered.
        reason: delivery.status === "skipped" ? delivery.reason : undefined,
      },
    };

    // Dev convenience only: in production the reset link is delivered by email and
    // must never appear in the API response — returning it there would let anyone
    // who can call this endpoint take over the account.
    if (resetUrl && delivery.status !== "sent" && process.env.NODE_ENV !== "production") {
      result.resetUrl = resetUrl;
    }

    return result;
  }

  async resetPassword(input: { token?: string; password?: string }): Promise<PasswordResetConfirmResult> {
    const token = requireNonEmpty(input.token, "Reset token is required.");
    const password = requirePassword(input.password);

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, this.jwtSecret, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    } catch {
      throw new Error("This password reset link is invalid or has expired.");
    }

    if (payload.purpose !== TOKEN_PURPOSES.passwordReset || typeof payload.sub !== "string") {
      throw new Error("This password reset link is invalid or has expired.");
    }

    if (!this.users.findById || !this.users.updatePasswordHash) {
      throw new Error("Password reset is unavailable.");
    }

    const user = await this.users.findById(payload.sub);
    if (!user || user.role === "candidate") {
      throw new Error("This password reset link is invalid or has expired.");
    }

    const fingerprint = typeof payload.ph === "string" ? payload.ph : "";
    if (!fingerprint || fingerprint !== passwordResetFingerprint(user.passwordHash)) {
      throw new Error("This password reset link is invalid or has expired.");
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await this.users.updatePasswordHash(user.id, passwordHash);

    return { message: "Password updated. You can sign in with your new password." };
  }

  private async sendEmailVerification(user: AuthUserRecord, message: string): Promise<RegistrationResult> {
    const token = this.signEmailVerificationToken(user);
    const verificationUrl = this.emailService?.buildEmailVerificationUrl?.(token) ?? defaultEmailVerificationUrl(token);
    const delivery = this.emailService?.sendEmailVerification
      ? await this.emailService.sendEmailVerification({
          to: user.email,
          userName: user.name,
          verificationUrl,
          expiresInLabel: "15 minutes",
        })
      : { status: "skipped" as const, reason: VERIFICATION_EMAIL_NOT_CONFIGURED_REASON };

    return {
      message,
      email: user.email,
      requiresEmailVerification: true,
      emailDelivery: {
        status: delivery.status,
        reason: delivery.status === "sent" || delivery.status === "queued" ? undefined : delivery.reason,
      },
      ...(process.env.NODE_ENV !== "production" && delivery.status !== "sent" && delivery.status !== "queued"
        ? { verificationUrl }
        : {}),
    };
  }

  private signEmailVerificationToken(user: AuthUserRecord): string {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        purpose: TOKEN_PURPOSES.emailVerification,
        ph: passwordResetFingerprint(user.passwordHash),
      },
      this.jwtSecret,
      { expiresIn: EMAIL_VERIFICATION_TTL },
    );
  }

  /**
   * Short-lived, purpose-scoped ticket for the WebSocket handshake. The session
   * JWT lives in an httpOnly cookie that browser JS cannot read, so the client
   * exchanges its cookie for this ticket and presents it to the gateway. The
   * `purpose` claim is what keeps the exchange one-way: the REST guard refuses
   * this ticket, so leaking it costs a socket connection, not the account.
   */
  issueRealtimeTicket(user: { id: string; email: string; role: string; organizationId?: string }): { ticket: string; expiresInSeconds: number } {
    const ticket = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, organizationId: user.organizationId, purpose: REALTIME_TICKET_PURPOSE },
      this.jwtSecret,
      { expiresIn: REALTIME_TICKET_TTL },
    );
    return { ticket, expiresInSeconds: 60 };
  }

  private signPasswordResetToken(user: AuthUserRecord): string {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        purpose: TOKEN_PURPOSES.passwordReset,
        // Binds the token to the current password hash so it dies after a successful reset.
        ph: passwordResetFingerprint(user.passwordHash),
      },
      this.jwtSecret,
      { expiresIn: PASSWORD_RESET_TTL },
    );
  }

  private toAuthResult(user: AuthUserRecord, remember = false): AuthResult {
    const safeUser = stripPasswordHash(user);
    return {
      token: jwt.sign(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
          purpose: TOKEN_PURPOSES.session,
        },
        this.jwtSecret,
        { expiresIn: remember ? "30d" : "1d" },
      ),
      user: safeUser,
    };
  }
}

export class EmailVerificationRequiredError extends Error {
  constructor() {
    super("Verify your email before signing in.");
    this.name = "EmailVerificationRequiredError";
  }
}

function passwordResetFingerprint(passwordHash: string): string {
  // Last 16 chars of the bcrypt hash are enough to invalidate tokens after a password change.
  return passwordHash.slice(-16);
}

function defaultPasswordResetUrl(token: string): string {
  return `${defaultAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

function defaultEmailVerificationUrl(token: string): string {
  return `${defaultAppUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

function defaultAppUrl(): string {
  const base = (process.env.APP_URL ?? process.env.FRONTEND_URL ?? "http://localhost:3010")
    .split(",")[0]
    ?.trim()
    .replace(/\/$/, "");
  return base || "http://localhost:3010";
}

const NAME_MAX_LENGTH = 200;
const EMAIL_MAX_LENGTH = 320;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Precomputed hash used to keep login response time constant when an account is
// missing, so timing cannot be used to enumerate registered emails.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("evalora-timing-equalizer", SALT_ROUNDS);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function requireEmail(value: string | undefined): string {
  const email = normalizeEmail(requireNonEmpty(value, "Email is required.", EMAIL_MAX_LENGTH));
  if (!EMAIL_PATTERN.test(email)) throw new Error("Enter a valid email address.");
  return email;
}

function requireNonEmpty(value: string | undefined, message: string, maxLength = 10_000): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(message);
  if (trimmed.length > maxLength) throw new Error("This value is longer than allowed.");
  return trimmed;
}

function requirePassword(value: string | undefined): string {
  requireNonEmpty(value, "Password is required.");
  return assertPasswordPolicy(value);
}

function workspaceName(requestedName: string | undefined, userName: string): string {
  const normalized = requestedName?.trim();
  return normalized ? normalized.slice(0, 120) : `${userName.trim().slice(0, 96)}'s workspace`;
}

function resolveJwtSecret(): string {
  const configured = process.env.JWT_SECRET?.trim();
  if (configured) return configured;
  // Fail closed outside an explicit local dev/test context (see auth.guard.ts).
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") return DEFAULT_JWT_SECRET;
  throw new Error("JWT_SECRET is required. Set it, or set NODE_ENV=development for the local default.");
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
    emailVerified: user.emailVerified,
    role: user.role,
    organizationId: user.organizationId,
    ...(user.profilePhoto ? { profilePhoto: user.profilePhoto } : {}),
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
    emailVerified: user.emailVerified,
    passwordHash: user.passwordHash,
    ...(user.profilePhoto ? { profilePhoto: user.profilePhoto } : {}),
    role: fromPrismaRole(user.role),
    organizationId: user.organizationId ?? undefined,
  };
}

function normalizeProfilePhoto(value: string | null | undefined): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("Profile photo must be an image.");
  const photo = value.trim();
  if (photo.length > 350_000) throw new Error("Profile photo is too large.");
  if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)) {
    throw new Error("Profile photo must be a JPG, PNG, or WebP image.");
  }
  return photo;
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
