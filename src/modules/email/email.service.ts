import { Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";

export type EmailDeliveryStatus = "sent" | "skipped" | "failed" | "queued";
export type EmailProviderName = "resend" | "gmail" | "none";

export interface EmailDeliveryResult {
  status: EmailDeliveryStatus;
  /** Human-readable note for UI / logs. */
  reason?: string;
  messageId?: string;
  provider?: EmailProviderName;
}

export interface WorkspaceInviteEmailInput {
  to: string;
  organizationName: string;
  inviterName?: string;
  inviteUrl: string;
  expiresAt: Date | string;
}

export interface CandidateAssessmentEmailInput {
  to: string;
  candidateName: string;
  organizationName?: string;
  assessmentTitle?: string;
  accessCode: string;
  assessmentUrl: string;
  expiresAt?: Date | string | null;
}

export interface PasswordResetEmailInput {
  to: string;
  userName: string;
  resetUrl: string;
  expiresInLabel: string;
}

export interface EmailVerificationInput {
  to: string;
  userName: string;
  verificationUrl: string;
  expiresInLabel: string;
}

export interface EmailSender {
  sendWorkspaceInvite(input: WorkspaceInviteEmailInput): Promise<EmailDeliveryResult>;
  sendCandidateAssessmentInvite(input: CandidateAssessmentEmailInput): Promise<EmailDeliveryResult>;
  sendEmailVerification(input: EmailVerificationInput): Promise<EmailDeliveryResult>;
  sendPasswordReset(input: PasswordResetEmailInput): Promise<EmailDeliveryResult>;
}

export type EmailRuntimeConfig =
  | {
      provider: "resend";
      apiKey: string;
      from: string;
      appUrl: string;
    }
  | {
      provider: "gmail";
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
      from: string;
      appUrl: string;
    };

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_RESEND_FROM = "Evalora <onboarding@resend.dev>";
const DEFAULT_GMAIL_HOST = "smtp.gmail.com";
const DEFAULT_GMAIL_PORT = 587;

@Injectable()
export class EmailService implements EmailSender {
  private readonly logger = new Logger(EmailService.name);
  private gmailTransporter: Transporter | null = null;

  constructor(private readonly config: EmailRuntimeConfig | null = createEmailConfigFromEnv()) {}

  get isConfigured(): boolean {
    return this.config !== null;
  }

  get provider(): EmailProviderName {
    return this.config?.provider ?? "none";
  }

  get appUrl(): string {
    return this.config?.appUrl ?? resolveAppUrl();
  }

  buildInviteUrl(token: string): string {
    return `${this.appUrl}/invite/${encodeURIComponent(token)}`;
  }

  buildAssessmentUrl(accessCode: string): string {
    return `${this.appUrl}/assessment/${encodeURIComponent(accessCode)}`;
  }

  buildPasswordResetUrl(token: string): string {
    return `${this.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  }

  buildEmailVerificationUrl(token: string): string {
    return `${this.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
  }

  async sendWorkspaceInvite(input: WorkspaceInviteEmailInput): Promise<EmailDeliveryResult> {
    if (!this.config) {
      return {
        status: "skipped",
        provider: "none",
        reason:
          "Email is not configured. Set EMAIL_PROVIDER=gmail (SMTP_USER/SMTP_PASS) or RESEND_API_KEY. Share the invite link manually.",
      };
    }

    const inviter = input.inviterName?.trim() || "Your teammate";
    const expires = formatWhen(input.expiresAt);
    const subject = `Join ${input.organizationName} on Evalora`;
    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#171b24;max-width:560px">
        <h2 style="margin:0 0 12px">You're invited to ${escapeHtml(input.organizationName)}</h2>
        <p style="margin:0 0 12px">${escapeHtml(inviter)} invited you to join their Evalora workspace as an <strong>interviewer</strong>.</p>
        <p style="margin:0 0 16px">You'll share templates, candidate sessions, and reports with the team.</p>
        <p style="margin:0 0 20px">
          <a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block;background:#0b7ea4;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">
            Accept invitation
          </a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;color:#5b6472">Or copy this link:</p>
        <p style="margin:0 0 16px;font-size:13px;word-break:break-all"><a href="${escapeHtml(input.inviteUrl)}">${escapeHtml(input.inviteUrl)}</a></p>
        <p style="margin:0;font-size:12px;color:#5b6472">This link expires ${escapeHtml(expires)}. If you did not expect this email, you can ignore it.</p>
      </div>
    `;
    const text = [
      `You're invited to ${input.organizationName} on Evalora.`,
      `${inviter} invited you as an interviewer.`,
      `Accept: ${input.inviteUrl}`,
      `Expires: ${expires}`,
    ].join("\n");

    return this.send({ to: input.to, subject, html, text });
  }

  async sendCandidateAssessmentInvite(input: CandidateAssessmentEmailInput): Promise<EmailDeliveryResult> {
    if (!this.config) {
      return {
        status: "skipped",
        provider: "none",
        reason:
          "Email is not configured. Set EMAIL_PROVIDER=gmail (SMTP_USER/SMTP_PASS) or RESEND_API_KEY. Share the assessment link manually.",
      };
    }

    const org = input.organizationName?.trim() || "Evalora";
    const title = input.assessmentTitle?.trim() || "your assessment";
    const subject = `Complete your assessment — ${title}`;
    const expires = input.expiresAt ? formatWhen(input.expiresAt) : null;
    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#171b24;max-width:560px">
        <h2 style="margin:0 0 12px">Assessment invitation</h2>
        <p style="margin:0 0 12px">Hi ${escapeHtml(input.candidateName)},</p>
        <p style="margin:0 0 12px"><strong>${escapeHtml(org)}</strong> invited you to complete <strong>${escapeHtml(title)}</strong> on Evalora.</p>
        <p style="margin:0 0 16px">No account is required. Open the private link below when you are ready.</p>
        <p style="margin:0 0 20px">
          <a href="${escapeHtml(input.assessmentUrl)}" style="display:inline-block;background:#0b7ea4;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">
            Start assessment
          </a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;color:#5b6472">Access code: <strong>${escapeHtml(input.accessCode)}</strong></p>
        <p style="margin:0 0 16px;font-size:13px;word-break:break-all"><a href="${escapeHtml(input.assessmentUrl)}">${escapeHtml(input.assessmentUrl)}</a></p>
        ${
          expires
            ? `<p style="margin:0;font-size:12px;color:#5b6472">This invitation expires ${escapeHtml(expires)}.</p>`
            : ""
        }
        <p style="margin:12px 0 0;font-size:12px;color:#5b6472">AI feedback is advisory and reviewed by humans. This is not a medical or personality diagnosis.</p>
      </div>
    `;
    const text = [
      `Hi ${input.candidateName},`,
      `${org} invited you to complete ${title} on Evalora.`,
      `Start: ${input.assessmentUrl}`,
      `Access code: ${input.accessCode}`,
      expires ? `Expires: ${expires}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return this.send({ to: input.to, subject, html, text });
  }

  async sendEmailVerification(input: EmailVerificationInput): Promise<EmailDeliveryResult> {
    if (!this.config) {
      return {
        status: "skipped",
        provider: "none",
        reason: "Email is not configured. Set Gmail SMTP or Resend credentials, then resend the verification email.",
      };
    }

    const name = input.userName?.trim() || "there";
    const expires = input.expiresInLabel?.trim() || "15 minutes";
    const subject = "Verify your Evalora email";
    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#171b24;max-width:560px">
        <h2 style="margin:0 0 12px">Verify your email</h2>
        <p style="margin:0 0 12px">Hi ${escapeHtml(name)},</p>
        <p style="margin:0 0 16px">Confirm this email address to activate your Evalora workspace account.</p>
        <p style="margin:0 0 20px">
          <a href="${escapeHtml(input.verificationUrl)}" style="display:inline-block;background:#0b7ea4;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">
            Verify email
          </a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;color:#5b6472">Or copy this link:</p>
        <p style="margin:0 0 16px;font-size:13px;word-break:break-all"><a href="${escapeHtml(input.verificationUrl)}">${escapeHtml(input.verificationUrl)}</a></p>
        <p style="margin:0;font-size:12px;color:#5b6472">This link expires in ${escapeHtml(expires)}. If you did not create this account, you can ignore this email.</p>
      </div>
    `;
    const text = [
      `Hi ${name},`,
      `Verify your Evalora email: ${input.verificationUrl}`,
      `This link expires in ${expires}.`,
      "If you did not create this account, ignore this email.",
    ].join("\n");

    return this.send({ to: input.to, subject, html, text });
  }

  async sendPasswordReset(input: PasswordResetEmailInput): Promise<EmailDeliveryResult> {
    if (!this.config) {
      return {
        status: "skipped",
        provider: "none",
        reason:
          "Email is not configured. Set EMAIL_PROVIDER=gmail (SMTP_USER/SMTP_PASS) or RESEND_API_KEY. Share the reset link manually.",
      };
    }

    const name = input.userName?.trim() || "there";
    const expires = input.expiresInLabel?.trim() || "1 hour";
    const subject = "Reset your Evalora password";
    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#171b24;max-width:560px">
        <h2 style="margin:0 0 12px">Reset your password</h2>
        <p style="margin:0 0 12px">Hi ${escapeHtml(name)},</p>
        <p style="margin:0 0 16px">We received a request to reset the password for your Evalora workspace account.</p>
        <p style="margin:0 0 20px">
          <a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;background:#0b7ea4;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">
            Choose a new password
          </a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;color:#5b6472">Or copy this link:</p>
        <p style="margin:0 0 16px;font-size:13px;word-break:break-all"><a href="${escapeHtml(input.resetUrl)}">${escapeHtml(input.resetUrl)}</a></p>
        <p style="margin:0;font-size:12px;color:#5b6472">This link expires in ${escapeHtml(expires)}. If you did not request a reset, you can ignore this email.</p>
      </div>
    `;
    const text = [
      `Hi ${name},`,
      `Reset your Evalora password: ${input.resetUrl}`,
      `This link expires in ${expires}.`,
      `If you did not request this, ignore this email.`,
    ].join("\n");

    return this.send({ to: input.to, subject, html, text });
  }

  private async send(input: { to: string; subject: string; html: string; text: string }): Promise<EmailDeliveryResult> {
    if (!this.config) {
      return { status: "skipped", provider: "none", reason: "Email is not configured." };
    }

    if (this.config.provider === "gmail") {
      return this.sendViaGmail(this.config, input);
    }
    return this.sendViaResend(this.config, input);
  }

  private async sendViaResend(
    config: Extract<EmailRuntimeConfig, { provider: "resend" }>,
    input: { to: string; subject: string; html: string; text: string },
  ): Promise<EmailDeliveryResult> {
    try {
      const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };

      if (!response.ok) {
        const raw = payload.message || payload.name || `Resend error (${response.status})`;
        const reason = friendlyResendError(raw, response.status);
        this.logger.warn(`Failed to send email to ${input.to} via Resend: ${raw}`);
        return { status: "failed", provider: "resend", reason };
      }

      this.logger.log(`Email sent via Resend to ${input.to} (${payload.id ?? "no-id"})`);
      return {
        status: "sent",
        provider: "resend",
        messageId: payload.id,
        reason: "Email sent via Resend.",
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Email provider unavailable.";
      this.logger.warn(`Resend send error for ${input.to}: ${reason}`);
      return { status: "failed", provider: "resend", reason };
    }
  }

  private async sendViaGmail(
    config: Extract<EmailRuntimeConfig, { provider: "gmail" }>,
    input: { to: string; subject: string; html: string; text: string },
  ): Promise<EmailDeliveryResult> {
    try {
      const transporter = this.getGmailTransporter(config);
      const info = await transporter.sendMail({
        from: config.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });

      const messageId = typeof info.messageId === "string" ? info.messageId : undefined;
      this.logger.log(`Email sent via Gmail SMTP to ${input.to} (${messageId ?? "no-id"})`);
      return {
        status: "sent",
        provider: "gmail",
        messageId,
        reason: "Email sent via Gmail SMTP.",
      };
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Gmail SMTP unavailable.";
      this.logger.warn(`Gmail SMTP send error for ${input.to}: ${raw}`);
      return {
        status: "failed",
        provider: "gmail",
        reason: friendlyGmailError(raw),
      };
    }
  }

  private getGmailTransporter(config: Extract<EmailRuntimeConfig, { provider: "gmail" }>): Transporter {
    if (this.gmailTransporter) return this.gmailTransporter;
    this.gmailTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
    return this.gmailTransporter;
  }
}

export function createEmailServiceFromEnv(): EmailService {
  return new EmailService(createEmailConfigFromEnv());
}

/** @deprecated Prefer createEmailConfigFromEnv — kept for older tests. */
export function createResendConfigFromEnv(): EmailRuntimeConfig | null {
  return createEmailConfigFromEnv();
}

export function createEmailConfigFromEnv(): EmailRuntimeConfig | null {
  const preferred = (process.env.EMAIL_PROVIDER ?? "auto").trim().toLowerCase();
  const appUrl = resolveAppUrl();

  const gmail = readGmailConfig(appUrl);
  const resend = readResendConfig(appUrl);

  if (preferred === "gmail") {
    if (!gmail) {
      // Explicit gmail request but incomplete env → no silent fallthrough to resend (avoids surprise blocks).
      return null;
    }
    return gmail;
  }

  if (preferred === "resend") {
    return resend;
  }

  // auto: prefer Gmail when configured (can mail any inbox for demos), else Resend.
  if (gmail) return gmail;
  if (resend) return resend;
  return null;
}

function readResendConfig(appUrl: string): EmailRuntimeConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    provider: "resend",
    apiKey,
    from: process.env.EMAIL_FROM?.trim() || DEFAULT_RESEND_FROM,
    appUrl,
  };
}

function readGmailConfig(appUrl: string): EmailRuntimeConfig | null {
  const user = (process.env.SMTP_USER ?? process.env.GMAIL_USER)?.trim();
  const pass = (process.env.SMTP_PASS ?? process.env.GMAIL_APP_PASSWORD)?.trim()?.replace(/\s+/g, "");
  if (!user || !pass) return null;

  const host = (process.env.SMTP_HOST ?? DEFAULT_GMAIL_HOST).trim() || DEFAULT_GMAIL_HOST;
  const port = Number(process.env.SMTP_PORT ?? DEFAULT_GMAIL_PORT);
  const secure =
    process.env.SMTP_SECURE?.trim() === "true" ||
    process.env.SMTP_SECURE?.trim() === "1" ||
    port === 465;

  const from =
    process.env.EMAIL_FROM?.trim() ||
    (user.includes("@") ? `Evalora <${user}>` : DEFAULT_RESEND_FROM);

  return {
    provider: "gmail",
    host,
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_GMAIL_PORT,
    secure,
    user,
    pass,
    from,
    appUrl,
  };
}

function resolveAppUrl(): string {
  const explicit = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const frontends = (process.env.FRONTEND_URL ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (frontends[0]) return frontends[0].replace(/\/$/, "");
  return "http://localhost:3010";
}

function formatWhen(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "soon";
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function friendlyResendError(message: string, status: number): string {
  const lower = message.toLowerCase();
  if (lower.includes("only send testing emails to your own email") || lower.includes("verify a domain")) {
    return (
      `${message} ` +
      "With onboarding@resend.dev you can only email the address on your Resend account. " +
      "For any Gmail without a domain: set EMAIL_PROVIDER=gmail with SMTP_USER/SMTP_PASS (Google App Password), " +
      "or verify a domain at resend.com/domains and set EMAIL_FROM. Until then, copy the invite link from the app."
    );
  }
  if (status === 403) return `${message} (Resend forbidden — check domain / recipient limits.)`;
  return message;
}

function friendlyGmailError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login") || lower.includes("badcredentials") || lower.includes("username and password not accepted")) {
    return (
      "Gmail rejected the SMTP login. Use a Google App Password (not your normal Gmail password), " +
      "enable 2-Step Verification, and set SMTP_USER / SMTP_PASS. See https://myaccount.google.com/apppasswords"
    );
  }
  if (lower.includes("less secure") || lower.includes("application-specific")) {
    return "Gmail requires an App Password for SMTP. Create one at https://myaccount.google.com/apppasswords";
  }
  if (lower.includes("econnrefused") || lower.includes("etimedout")) {
    return `Could not reach Gmail SMTP (${message}). Check network / SMTP_HOST / SMTP_PORT.`;
  }
  return message;
}
