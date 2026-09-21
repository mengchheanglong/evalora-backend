-- Named "billing_plan" (not "SubscriptionPlan") on purpose: older databases
-- already contain a legacy "SubscriptionPlan" enum (FREE/PRO/ENTERPRISE) that
-- backed a removed organizations.plan column. Prisma maps this enum through
-- @@map("billing_plan") in schema.prisma.
CREATE TYPE "billing_plan" AS ENUM ('PLUS', 'PRO', 'BUSINESS');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELLED', 'EXPIRED');
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');

CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "plan" "billing_plan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "billing_cycle" "BillingCycle" NOT NULL,
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "provider_customer_id" TEXT,
    "provider_subscription_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscriptions_organization_id_key" ON "subscriptions"("organization_id");
CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_key" ON "subscriptions"("provider_subscription_id");
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
