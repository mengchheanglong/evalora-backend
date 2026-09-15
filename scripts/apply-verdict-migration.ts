/**
 * Apply the recruiter verdict migration manually to Neon database.
 * Run with: npx tsx scripts/apply-verdict-migration.ts
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function run() {
  // Step 1: Create the enum
  try {
    await p.$executeRawUnsafe(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecruiterVerdict') THEN
          CREATE TYPE "RecruiterVerdict" AS ENUM ('STRONG_HIRE', 'HIRE', 'NEUTRAL', 'NO_HIRE');
        END IF;
      END $$`
    );
    console.log("1. Enum created or already exists");
  } catch (e: any) {
    console.error("Enum error:", e.message);
  }

  // Step 2: Add columns one by one
  const cols: [string, string][] = [
    ["recruiter_verdict", '"RecruiterVerdict"'],
    ["recruiter_tags", "JSONB"],
    ["recruiter_score", "DOUBLE PRECISION"],
    ["decided_at", "TIMESTAMP(3)"],
    ["decided_by_id", "UUID"],
  ];
  for (const [name, type] of cols) {
    try {
      await p.$executeRawUnsafe(
        `ALTER TABLE "candidate_reports" ADD COLUMN IF NOT EXISTS "${name}" ${type}`
      );
      console.log(`2. Added column: ${name}`);
    } catch (e: any) {
      console.error(`Column ${name} error:`, e.message);
    }
  }

  // Step 3: Add FK constraint
  try {
    await p.$executeRawUnsafe(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_reports_decided_by_id_fkey') THEN
          ALTER TABLE "candidate_reports" ADD CONSTRAINT "candidate_reports_decided_by_id_fkey"
            FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$`
    );
    console.log("3. FK created or already exists");
  } catch (e: any) {
    console.error("FK error:", e.message);
  }

  // Step 4: Verify
  const result = await p.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'candidate_reports'
     AND (column_name LIKE '%recruiter%' OR column_name LIKE '%decided%')
     ORDER BY column_name`
  );
  console.log(
    "4. Verification - columns in candidate_reports:",
    result.map((r) => r.column_name)
  );

  // Step 5: Check enum
  const enumResult = await p.$queryRawUnsafe<{ typname: string }[]>(
    `SELECT typname FROM pg_type WHERE typname = 'RecruiterVerdict'`
  );
  console.log("5. Enum exists:", enumResult.length > 0);

  await p.$disconnect();
  console.log("Done!");
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
