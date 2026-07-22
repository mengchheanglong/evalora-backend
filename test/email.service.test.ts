import { test } from "node:test";
import { strict as assert } from "node:assert";
import { EmailService } from "../src/modules/email/email.service";

test("EmailService skips delivery when no provider is configured", async () => {
  const service = new EmailService(null);
  const result = await service.sendWorkspaceInvite({
    to: "teammate@example.com",
    organizationName: "Acme",
    inviterName: "Maya",
    inviteUrl: "http://localhost:3010/invite/tok",
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  assert.equal(result.status, "skipped");
  assert.equal(result.provider, "none");
  assert.match(result.reason ?? "", /not configured/i);
});

test("EmailService builds and renders verification emails", async () => {
  const originalFetch = globalThis.fetch;
  let calledBody: any;
  globalThis.fetch = (async (_url: any, init?: any) => {
    calledBody = JSON.parse(String(init?.body ?? "{}"));
    return { ok: true, json: async () => ({ id: "verify_123" }) } as Response;
  }) as typeof fetch;

  try {
    const service = new EmailService({
      provider: "resend",
      apiKey: "re_test",
      from: "Evalora <onboarding@resend.dev>",
      appUrl: "http://localhost:3010",
    });
    const verificationUrl = service.buildEmailVerificationUrl("signed-token");
    const result = await service.sendEmailVerification({
      to: "owner@example.com",
      userName: "Owner",
      verificationUrl,
      expiresInLabel: "15 minutes",
    });

    assert.equal(result.status, "sent");
    assert.match(verificationUrl, /verify-email\?token=signed-token/);
    assert.match(calledBody.subject, /verify/i);
    assert.match(calledBody.html, /Verify email/);
    assert.match(calledBody.html, /signed-token/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("EmailService posts to Resend when configured", async () => {
  const originalFetch = globalThis.fetch;
  let calledUrl = "";
  let calledBody: any;
  globalThis.fetch = (async (url: any, init?: any) => {
    calledUrl = String(url);
    calledBody = JSON.parse(String(init?.body ?? "{}"));
    return {
      ok: true,
      json: async () => ({ id: "email_123" }),
    } as Response;
  }) as typeof fetch;

  try {
    const service = new EmailService({
      provider: "resend",
      apiKey: "re_test",
      from: "Evalora <onboarding@resend.dev>",
      appUrl: "http://localhost:3010",
    });
    const result = await service.sendCandidateAssessmentInvite({
      to: "candidate@example.com",
      candidateName: "Dara",
      organizationName: "Acme",
      assessmentTitle: "SE Round",
      accessCode: "EV-TEST",
      assessmentUrl: "http://localhost:3010/assessment/EV-TEST",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    assert.equal(result.status, "sent");
    assert.equal(result.provider, "resend");
    assert.equal(result.messageId, "email_123");
    assert.equal(calledUrl, "https://api.resend.com/emails");
    assert.equal(calledBody.to[0], "candidate@example.com");
    assert.match(calledBody.subject, /SE Round/);
    assert.match(calledBody.html, /EV-TEST/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("EmailService reports failed delivery on Resend error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 403,
      json: async () => ({ message: "Domain not verified" }),
    }) as Response) as typeof fetch;

  try {
    const service = new EmailService({
      provider: "resend",
      apiKey: "re_test",
      from: "Evalora <onboarding@resend.dev>",
      appUrl: "http://localhost:3010",
    });
    const result = await service.sendWorkspaceInvite({
      to: "teammate@example.com",
      organizationName: "Acme",
      inviteUrl: "http://localhost:3010/invite/tok",
      expiresAt: new Date(),
    });
    assert.equal(result.status, "failed");
    assert.equal(result.provider, "resend");
    assert.match(result.reason ?? "", /Domain not verified|verify a domain|EMAIL_PROVIDER=gmail/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("EmailService sends via Gmail SMTP when configured", async () => {
  const service = new EmailService({
    provider: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    user: "demo@gmail.com",
    pass: "app-password-here",
    from: "Evalora <demo@gmail.com>",
    appUrl: "http://localhost:3010",
  });

  // Patch private transporter factory by calling send and mocking nodemailer through a stub on the instance.
  const fakeSendMail = async () => ({ messageId: "<gmail-msg-1@smtp.gmail.com>" });
  (service as any).getGmailTransporter = () => ({ sendMail: fakeSendMail });

  const result = await service.sendWorkspaceInvite({
    to: "friend@gmail.com",
    organizationName: "Acme",
    inviterName: "Owner",
    inviteUrl: "http://localhost:3010/invite/tok",
    expiresAt: new Date(Date.now() + 86_400_000),
  });

  assert.equal(result.status, "sent");
  assert.equal(result.provider, "gmail");
  assert.equal(result.messageId, "<gmail-msg-1@smtp.gmail.com>");
  assert.match(result.reason ?? "", /Gmail SMTP/i);
});

test("EmailService maps Gmail auth failures to helpful guidance", async () => {
  const service = new EmailService({
    provider: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    user: "demo@gmail.com",
    pass: "wrong",
    from: "Evalora <demo@gmail.com>",
    appUrl: "http://localhost:3010",
  });
  (service as any).getGmailTransporter = () => ({
    sendMail: async () => {
      throw new Error("Invalid login: 535-5.7.8 Username and Password not accepted");
    },
  });

  const result = await service.sendCandidateAssessmentInvite({
    to: "candidate@example.com",
    candidateName: "Dara",
    assessmentTitle: "Round 1",
    accessCode: "EV-1",
    assessmentUrl: "http://localhost:3010/assessment/EV-1",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.provider, "gmail");
  assert.match(result.reason ?? "", /App Password/i);
});

test("EmailService builds app absolute URLs", () => {
  const service = new EmailService({
    provider: "resend",
    apiKey: "re_test",
    from: "Evalora <onboarding@resend.dev>",
    appUrl: "http://localhost:3010",
  });
  assert.equal(service.buildInviteUrl("abc"), "http://localhost:3010/invite/abc");
  assert.equal(service.buildAssessmentUrl("EV-1"), "http://localhost:3010/assessment/EV-1");
});
