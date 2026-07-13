import { readFileSync } from "node:fs";

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
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "Evalora <onboarding@resend.dev>";
  const to = process.env.RESEND_TEST_TO?.trim() || process.argv[2] || "test.user.notreal@gmail.com";

  if (!key) {
    console.error("RESEND_API_KEY missing");
    process.exit(1);
  }

  console.log(`from=${from}`);
  console.log(`to=${to}`);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Evalora Gmail delivery probe",
      text: "Probe email from Evalora Resend config.",
      html: "<p>Probe email from Evalora Resend config.</p>",
    }),
  });

  const body = await res.json().catch(() => ({}));
  console.log(`http=${res.status}`);
  console.log(`body=${JSON.stringify(body)}`);

  if (!res.ok) {
    console.log("RESULT=BLOCKED_OR_FAILED");
    process.exit(2);
  }
  console.log("RESULT=ACCEPTED_BY_RESEND");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
