# Prisma Notes

The first schema draft lives in `prisma/schema.prisma`.

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
