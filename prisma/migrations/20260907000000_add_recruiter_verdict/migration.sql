-- CreateEnum
CREATE TYPE "RecruiterVerdict" AS ENUM ('STRONG_HIRE', 'HIRE', 'NEUTRAL', 'NO_HIRE');

-- AlterTable: Add recruiter verdict fields to candidate_reports
ALTER TABLE "candidate_reports" ADD COLUMN "recruiter_verdict" "RecruiterVerdict",
ADD COLUMN "recruiter_tags" JSONB,
ADD COLUMN "recruiter_score" DOUBLE PRECISION,
ADD COLUMN "decided_at" TIMESTAMP(3),
ADD COLUMN "decided_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "candidate_reports" ADD CONSTRAINT "candidate_reports_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
