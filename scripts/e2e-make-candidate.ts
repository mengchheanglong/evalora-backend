import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "e2e-real-candidate@evalora-test.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("EXISTS", existing.id, existing.role);
    return;
  }
  const passwordHash = await bcrypt.hash("Candidate123x", 12);
  const user = await prisma.user.create({
    data: {
      name: "E2E Real Candidate",
      email,
      emailVerified: true,
      passwordHash,
      role: "CANDIDATE",
      organizationId: null,
    },
  });
  console.log("CREATED", user.id, user.role);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
