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

## Integrity monitoring migration

`prisma/migrations/1786605432509_add_integrity_monitoring/` adds the
`warning_count` / `warning_limit` columns to `interview_sessions` (defaults
`0` / `2`) and creates the `integrity_events` table with the
`(session_id, client_event_id)` unique constraint.

- Fresh database: `pnpm exec prisma migrate deploy` applies it.
- Existing database that was previously `prisma db push`ed: either keep using
  `prisma db push` (it will warn about the migrations folder but still sync the
  schema) or baseline the migration with
  `pnpm exec prisma migrate resolve --applied 1786605432509_add_integrity_monitoring`
  before `migrate deploy` so the ALTER is not re-run against already-updated
  tables.

No migration was applied as part of this change set — apply it when you have
database access, per your deploy process.

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
