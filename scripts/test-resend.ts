import { readFileSync } from "node:fs";
import { createEmailServiceFromEnv } from "../src/modules/email/email.service";

function loadEnvFile(path: string) {
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnvFile(".env");
  const email = createEmailServiceFromEnv();
  console.log(`configured=${email.isConfigured}`);
  console.log(`appUrl=${email.appUrl}`);
  console.log(`from=${process.env.EMAIL_FROM || "Evalora <onboarding@resend.dev>"}`);

  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.error("RESEND_API_KEY missing");
    process.exit(1);
  }

  const domainsRes = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${key}` },
  });
  const domainsBody = (await domainsRes.json().catch(() => ({}))) as { message?: string; name?: string; data?: unknown };
  console.log(`resend_domains_http=${domainsRes.status}`);
  console.log(`resend_domains_ok=${domainsRes.ok}`);
  if (!domainsRes.ok) {
    console.log(`resend_domains_error=${domainsBody.message || domainsBody.name || "unknown"}`);
  }

  // Resend documents delivered@resend.dev as a test sink address.
  const to = process.env.RESEND_TEST_TO?.trim() || "delivered@resend.dev";
  console.log(`sending_workspace_invite_to=${to}`);

  const workspace = await email.sendWorkspaceInvite({
    to,
    organizationName: "Evalora Resend Live Test",
    inviterName: "Automated Test",
    inviteUrl: email.buildInviteUrl("probe-workspace-token"),
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
  });
  console.log(`workspace_status=${workspace.status}`);
  console.log(`workspace_reason=${workspace.reason ?? ""}`);
  console.log(`workspace_messageId=${workspace.messageId ?? ""}`);

  console.log(`sending_candidate_invite_to=${to}`);
  const candidate = await email.sendCandidateAssessmentInvite({
    to,
    candidateName: "Test Candidate",
    organizationName: "Evalora Resend Live Test",
    assessmentTitle: "Live Resend Probe",
    accessCode: "EV-RESEND-TEST",
    assessmentUrl: email.buildAssessmentUrl("EV-RESEND-TEST"),
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
  });
  console.log(`candidate_status=${candidate.status}`);
  console.log(`candidate_reason=${candidate.reason ?? ""}`);
  console.log(`candidate_messageId=${candidate.messageId ?? ""}`);

  if (workspace.status === "sent" && candidate.status === "sent") {
    console.log("RESULT=PASS Resend accepted both emails");
    process.exit(0);
  }
  console.log("RESULT=FAIL check reasons above");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
