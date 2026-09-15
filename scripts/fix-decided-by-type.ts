/**
 * Fix decided_by_id type from UUID to TEXT to match users.id, then add FK.
 * Run with: npx tsx scripts/fix-decided-by-type.ts
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function run() {
  // Drop the UUID column and recreate as TEXT to match users.id
  try {
    await p.$executeRawUnsafe(
      `ALTER TABLE "candidate_reports" DROP COLUMN IF EXISTS "decided_by_id"`
    );
    console.log("1. Dropped decided_by_id (uuid)");
  } catch (e: any) {
    console.error("Drop error:", e.message);
  }

  try {
    await p.$executeRawUnsafe(
      `ALTER TABLE "candidate_reports" ADD COLUMN "decided_by_id" TEXT`
    );
    console.log("2. Added decided_by_id as TEXT");
  } catch (e: any) {
    console.error("Add column error:", e.message);
  }

  // Add FK constraint
  try {
    await p.$executeRawUnsafe(
      `ALTER TABLE "candidate_reports" ADD CONSTRAINT "candidate_reports_decided_by_id_fkey"
       FOREIGN KEY ("decided_by_id") REFERENCES "users"("id")
       ON DELETE SET NULL ON UPDATE CASCADE`
    );
    console.log("3. FK constraint added");
  } catch (e: any) {
    console.error("FK error:", e.message);
  }

  // Verify
  const result = await p.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'candidate_reports'
     AND column_name = 'decided_by_id'`
  );
  console.log("4. decided_by_id:", result);

  await p.$disconnect();
  console.log("Done!");
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
