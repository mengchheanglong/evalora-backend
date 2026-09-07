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
