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
```

When database access is ready, add migration scripts such as:

```bash
pnpm prisma migrate dev --name init
```

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
- `ReportsService.persistReport()` deletes old module evaluations for a session, writes fresh `Evaluation` rows, and upserts one `CandidateReport` for the same session.
