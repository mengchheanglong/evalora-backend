# Prisma Notes

The first schema draft lives in `prisma/schema.prisma`.

## Selected MVP database

- Database: PostgreSQL on Neon.
- Prisma datasource provider: `postgresql`.
- Env var: `DATABASE_URL`.
- Use Neon's pooled connection string when available.
- Keep `sslmode=require` in the connection URL.

Never commit a real Neon password or full production connection string.

## Commands

```bash
pnpm prisma:validate
pnpm prisma:format
pnpm prisma:generate
pnpm exec prisma db push
pnpm seed:prebuilt
```

`pnpm seed:prebuilt` upserts editable researched assessment banks for HR Generalist, Software Engineer, and Team Leader roles into Neon. It creates a seed organization/owner only when needed and does not print secrets.

`User.emailVerified` defaults to `false` for new password registrations. When adding the column to a database that already contains users, backfill existing rows to `true` before setting the database default to `false`; otherwise existing workspace accounts will be unable to sign in.

When database access is ready, add migration scripts such as:

```bash
pnpm prisma migrate dev --name init
```

## Integrity monitoring schema

The schema in `prisma/schema.prisma` includes `warning_count` / `warning_limit` columns in `interview_sessions` (defaults `0` / `2`) and creates the `integrity_events` table with the `(session_id, client_event_id)` unique constraint. Apply schema updates directly via `pnpm exec prisma db push`.

## Platform administration schema

`Organization.plan` (`SubscriptionPlan`, default `FREE`), `Organization.is_suspended`/`suspended_at`, `User.is_suspended`/`suspended_at`, and the `users(role, created_at)` index back the Admin Hub. On a fresh database `pnpm exec prisma db push` applies them. On the shared Neon database apply the additive script below with `pnpm exec prisma db execute --file <file> --schema prisma/schema.prisma` rather than `db push`, so drift from other branches is never dropped:

```sql
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');
ALTER TABLE "organizations"
  ADD COLUMN "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "is_suspended" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "suspended_at" TIMESTAMP(3);
ALTER TABLE "users"
  ADD COLUMN "is_suspended" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "suspended_at" TIMESTAMP(3);
CREATE INDEX "users_role_created_at_idx" ON "users"("role", "created_at");
```

Public registration only creates workspace owners, so the first platform admin is promoted with `pnpm admin:grant <email>`. After that, admins promote others from the Admin Hub.

## Model implementation order

1. `User`, `Organization`.
2. `AssessmentTemplate`, `AssessmentModule`, `Question`.
3. `InterviewSession`.
4. `Response`, `AIMessage`, `CodeSubmission`.
5. `Evaluation`, `CandidateReport`, `ReviewerNote`.

## Guardrails

- Use UUID IDs.
- Use enums for role/status/module/question types.
- Keep AI evidence JSON attached to evaluations and reports.
- Keep report access role-restricted.
- `ReportsService.generateAndPersistReport()` evaluates saved session responses grouped by module, then `persistReport()` deletes old module evaluations for the session, writes fresh `Evaluation` rows, and upserts one `CandidateReport` for the same session.

## Subscription schema rollout

Step 1 adds `20260913000000_add_organization_subscription/migration.sql`, containing only new subscription enums, table, indexes, and its organization foreign key. Step 4 adds `20260913010000_add_manual_payment_attempts/migration.sql`, which creates the `payment_attempts` table with its two unique keys (`tran_id`, `idempotency_key`), its indexes and foreign keys, and adds `subscriptions.renewal_mode`, `subscriptions.pending_plan` and `subscriptions.pending_billing_cycle`.

The plan enum is mapped to the database type `billing_plan` via `@@map("billing_plan")` in `schema.prisma`. Long-lived databases still contain a legacy `SubscriptionPlan` enum (`FREE`/`PRO`/`ENTERPRISE`, formerly backing a removed `organizations.plan` column); creating a database enum with that name fails with `type "SubscriptionPlan" already exists`. The Prisma Client name is unchanged (`SubscriptionPlan`, values `PLUS`/`PRO`/`BUSINESS`).

Apply both through the environment's existing schema rollout process before serving billing. This repository has a partial migration history; do not run the whole history against an unbaselined existing database. On a database kept in sync with `prisma db push` (so it has no `_prisma_migrations` table), baseline once and then deploy only the pending billing migrations:

```bash
pnpm exec prisma migrate resolve --applied 20260825000000_rename_to_detection_enabled
pnpm exec prisma migrate status   # expect only the two billing migrations pending
pnpm exec prisma migrate deploy
```

The baseline step records a migration whose effect (`interview_sessions.detection_enabled`) the database already has; it runs no DDL and drops nothing. If a migration fails partway, recover with `prisma migrate resolve --rolled-back <migration_name>` after fixing it — never with `prisma migrate reset` against Neon. Validation and client generation do not apply database changes. No existing accounts receive a subscription automatically, and no subscription is created by the migration itself.

PayWay is prepaid and manual: the schema deliberately stores no card data, no recurring token, and no billing worker state. `renewal_mode` defaults to `MANUAL` and is never written as `AUTOMATIC` by the current code.
