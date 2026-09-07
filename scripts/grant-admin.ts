// Grants the platform `admin` role to an existing, verified workspace account.
// Public registration can only create workspace owners, so the first platform
// operator has to be promoted out-of-band; after that, admins can promote
// others from the Admin Hub.
//
//   pnpm admin:grant owner@example.com
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: pnpm admin:grant <email>");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, emailVerified: true, isSuspended: true },
  });
  if (!user) throw new Error(`No account found for ${email}.`);
  if (user.role === "CANDIDATE") {
    throw new Error("Candidate invite records cannot become platform admins. Register a workspace account with this email first.");
  }
  if (user.isSuspended) throw new Error("This account is suspended. Reactivate it before granting admin.");
  if (user.role === "ADMIN") {
    console.log(JSON.stringify({ email, role: "admin", changed: false }));
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  console.log(
    JSON.stringify({ email, previousRole: user.role.toLowerCase(), role: "admin", changed: true, emailVerified: user.emailVerified }),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
