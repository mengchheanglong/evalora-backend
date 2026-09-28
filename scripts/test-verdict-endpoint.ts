/**
 * Test the PATCH /reports/:sessionId/verdict endpoint.
 * Run with: npx tsx scripts/test-verdict-endpoint.ts
 */
import { PrismaClient } from "@prisma/client";
import * as jwt from "jsonwebtoken";

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const JWT_SECRET = process.env.JWT_SECRET || "replace-with-local-development-secret";

async function run() {
  // 1. Find an organization user and a report
  const orgUser = await p.user.findFirst({
    where: { role: "ORGANIZATION" },
    select: { id: true, email: true, organizationId: true, role: true },
  });

  if (!orgUser) {
    console.error("No organization user found!");
    await p.$disconnect();
    return;
  }
  console.log("1. Organization user:", orgUser.email, orgUser.id);

  // Find a session belonging to this user's organization
  const session = await p.interviewSession.findFirst({
    where: { organizationId: orgUser.organizationId },
    select: { id: true, organizationId: true },
  });

  if (!session) {
    console.error("No session found for this organization!");
    await p.$disconnect();
    return;
  }
  console.log("2. Session:", session.id, "org:", session.organizationId);

  // 2. Find or create a report for this session
  let report = await p.candidateReport.findUnique({
    where: { sessionId: session.id },
    select: { sessionId: true },
  });

  if (!report) {
    console.log("No report for this session, creating one...");
    report = await p.candidateReport.create({
      data: {
        sessionId: session.id,
        overallScore: 0.75,
        summary: "Test report",
        strengths: [],
        improvementAreas: [],
        evidence: [],
        advisoryNotice: "AI-supported feedback is advisory.",
      },
      select: { sessionId: true },
    });
  }
  console.log("3. Report exists for session:", report.sessionId);

  // 3. Create a JWT token with the correct purpose
  const token = jwt.sign(
    {
      sub: orgUser.id,
      email: orgUser.email,
      role: orgUser.role,
      organizationId: orgUser.organizationId,
      purpose: "session",
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
  console.log("4. JWT token created");

  // 4. Call the PATCH endpoint
  const payload = {
    verdict: "HIRE",
    tags: ["Strong Problem Solving", "Great Communication"],
    notes: "Test verdict from script",
  };

  const response = await fetch(`http://localhost:4000/api/reports/${session.id}/verdict`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  console.log(`5. Response status: ${response.status}`);
  console.log(`   Response body: ${body}`);

  if (response.ok) {
    // Verify the verdict was saved
    const updated = await p.candidateReport.findUnique({
      where: { sessionId: session.id },
      select: {
        recruiterVerdict: true,
        recruiterTags: true,
        decidedAt: true,
        decidedById: true,
      },
    });
    console.log("6. Verified in DB:", JSON.stringify(updated));
  }

  await p.$disconnect();
  console.log("Done!");
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
