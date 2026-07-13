# Evalora Backend

NestJS + TypeScript API for Evalora, backed by PostgreSQL/Neon and Prisma.

## AI agent start rule

Before changing this repository, read `AGENTS.md` and the product documents it references.

## Run locally

```bash
pnpm install
cp .env.example .env
pnpm prisma:generate
pnpm seed:prebuilt
pnpm dev
```

API: <http://localhost:4000/api>

Health check: <http://localhost:4000/api/health>

The frontend runs separately at <http://localhost:3010>.

## Current capabilities

- JWT authentication and role/organization ownership checks.
- Public interviewer registration with atomic workspace creation.
- Nested assessment-template CRUD and researched starter banks.
- High-entropy, expiring candidate invitations with rate-limited access.
- Deterministic candidate question assignment and autosave validation.
- Access-code-scoped AI interview/follow-up history with DeepSeek fallback.
- JavaScript execution through Judge0 or self-hosted Piston, hidden-test grading, and persisted submissions.
- Evidence-backed advisory report generation, report readback, and reviewer notes.
- Organization-scoped dashboard/activity/module/score/theme analytics.

## Module map

- `src/modules/auth/` - authentication, guards, roles, and ownership helpers.
- `src/modules/templates/` - assessment template CRUD and prebuilt banks.
- `src/modules/sessions/` - workspace sessions and candidate invitation access.
- `src/modules/responses/` - scoped review reads and candidate autosave.
- `src/modules/ai/` - provider adapter, deterministic fallback, and candidate conversation boundary.
- `src/modules/code/` - execution adapters, challenge bank, grading, and submissions.
- `src/modules/reports/` - evaluation aggregation, persisted reports, and reviewer notes.
- `src/modules/analytics/` - organization-scoped operational analytics.
- `prisma/schema.prisma` - database schema.

## Environment highlights

- `DATABASE_URL`, `JWT_SECRET`
- `GOOGLE_CLIENT_ID` — Google Identity Services client ID for `POST /auth/google` (same value as frontend `NEXT_PUBLIC_GOOGLE_CLIENT_ID`)
- `FRONTEND_URL`, `APP_URL` (absolute links in emails; defaults to first frontend origin)
- `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`
- Email (optional): `EMAIL_PROVIDER=auto|gmail|resend`
  - **Gmail SMTP** (free demos): `SMTP_USER`, `SMTP_PASS` (Google App Password), optional `SMTP_HOST`/`SMTP_PORT`
  - **Resend**: `RESEND_API_KEY`, `EMAIL_FROM` — test domain only mails your Resend account email unless you verify a domain
  - Without either, invites still work with `emailDelivery.status = "skipped"` (copy link)
- `CODE_EXECUTION_PROVIDER=judge0|piston`
- `JUDGE0_API_URL`, optional Judge0 credentials/language ID
- `PISTON_URL`, optional Piston API key

See `.env.example` for limits and local defaults. Production must set a strong `JWT_SECRET` and should use a capacity-controlled execution sandbox.

## Source of truth

- `AGENTS.md` - backend agent/team alignment.
- `docs/SRS.md` - requirements and MVP scope.
- `docs/API-CONTRACT.md` - shared API contract.
- `docs/DATABASE-DESIGN.md` - persistence model.
- `docs/AI-SERVICE-CONTRACT.md` - AI boundary and safety.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm prisma:validate
```

This repository is intentionally independent from the frontend repository.
