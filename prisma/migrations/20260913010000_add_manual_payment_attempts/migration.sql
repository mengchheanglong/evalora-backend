-- Step 4 (manual renewal): prepaid hosted-checkout persistence.
-- Adds no recurring-credential storage; one verified payment grants exactly one
-- billing cycle and every renewal is a new customer-initiated payment.

CREATE TYPE "RenewalMode" AS ENUM ('MANUAL', 'AUTOMATIC');
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');
CREATE TYPE "PaymentAttemptPurpose" AS ENUM ('NEW_SUBSCRIPTION', 'RENEWAL', 'PLAN_CHANGE');

ALTER TABLE "subscriptions"
    ADD COLUMN "renewal_mode" "RenewalMode" NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN "pending_plan" "billing_plan",
    ADD COLUMN "pending_billing_cycle" "BillingCycle";

CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "tran_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "plan" "billing_plan" NOT NULL,
    "billing_cycle" "BillingCycle" NOT NULL,
    "purpose" "PaymentAttemptPurpose" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL,
    "provider_reference" TEXT,
    "provider_status" TEXT,
    "failure_reason" TEXT,
    "verified_at" TIMESTAMP(3),
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_attempts_tran_id_key" ON "payment_attempts"("tran_id");
CREATE UNIQUE INDEX "payment_attempts_idempotency_key_key" ON "payment_attempts"("idempotency_key");
CREATE INDEX "payment_attempts_organization_id_created_at_idx" ON "payment_attempts"("organization_id", "created_at");
CREATE INDEX "payment_attempts_status_created_at_idx" ON "payment_attempts"("status", "created_at");

ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
