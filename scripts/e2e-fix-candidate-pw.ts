import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "e2e-real-candidate@evalora-test.local";
  const passwordHash = await bcrypt.hash("Candidate123x", 10);
  await prisma.user.update({ where: { email }, data: { passwordHash } });
  console.log("PW SET");
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
