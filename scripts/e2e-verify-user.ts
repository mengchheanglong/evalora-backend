import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] ?? "e2e-probe@evalora-test.local";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log("NO USER", email);
    process.exitCode = 1;
    return;
  }
  await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
  console.log("VERIFIED", user.id, "role:", user.role, "org:", user.organizationId);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
