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
    // Always load from file for this script so latest .env wins
    process.env[key] = value;
  }
}

async function main() {
  loadEnvFile(".env");
  const to = process.argv[2]?.trim() || process.env.RESEND_TEST_TO?.trim();
  if (!to) {
    console.error("Usage: pnpm exec tsx scripts/send-test-to.ts you@gmail.com");
    process.exit(1);
  }

  const email = createEmailServiceFromEnv();
  console.log(`provider=${email.provider}`);
  console.log(`configured=${email.isConfigured}`);
  console.log(`appUrl=${email.appUrl}`);
  console.log(`to=${to}`);

  if (!email.isConfigured) {
    console.error("Email not configured. Set SMTP_USER/SMTP_PASS or RESEND_API_KEY.");
    process.exit(1);
  }

  const workspace = await email.sendWorkspaceInvite({
    to,
    organizationName: "Evalora Live Test",
    inviterName: "Evalora Automated Test",
    inviteUrl: email.buildInviteUrl("live-gmail-test-token"),
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
  });
  console.log(`workspace_status=${workspace.status}`);
  console.log(`workspace_provider=${workspace.provider ?? ""}`);
  console.log(`workspace_reason=${workspace.reason ?? ""}`);
  console.log(`workspace_messageId=${workspace.messageId ?? ""}`);

  const candidate = await email.sendCandidateAssessmentInvite({
    to,
    candidateName: "Mengchheang",
    organizationName: "Evalora Live Test",
    assessmentTitle: "Gmail SMTP Delivery Test",
    accessCode: "EV-GMAIL-TEST",
    assessmentUrl: email.buildAssessmentUrl("EV-GMAIL-TEST"),
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
  });
  console.log(`candidate_status=${candidate.status}`);
  console.log(`candidate_provider=${candidate.provider ?? ""}`);
  console.log(`candidate_reason=${candidate.reason ?? ""}`);
  console.log(`candidate_messageId=${candidate.messageId ?? ""}`);

  if (workspace.status === "sent" && candidate.status === "sent") {
    console.log("RESULT=PASS both emails accepted by provider");
    process.exit(0);
  }
  console.log("RESULT=FAIL");
  process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
