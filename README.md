# Evalora Backend

Standalone NestJS + TypeScript backend for Evalora.

## Run locally

```bash
pnpm install
cp .env.example .env
pnpm prisma:generate
pnpm dev
```

Local API: <http://localhost:4000/api>

Health check: <http://localhost:4000/api/health>

## Current state

This backend is a scaffold with route contracts and demo responses. Replace demo data with Prisma services as features are implemented.

## Module map

- `src/modules/auth/` — register, login, logout, current user.
- `src/modules/templates/` — assessment template CRUD.
- `src/modules/sessions/` — interview session creation/start/complete.
- `src/modules/responses/` — response submission/autosave boundary.
- `src/modules/ai/` — AI question, follow-up, evaluation, report generation boundary.
- `src/modules/code/` — code run/submit boundary for Judge0/sandbox.
- `src/modules/reports/` — candidate report retrieval/generation/export boundary.
- `src/modules/analytics/` — dashboard summary/activity.
- `prisma/schema.prisma` — database schema draft.

## Source of truth

- `AGENTS.md` — backend agent/team alignment.
- `docs/SRS.md` — product requirements.
- `docs/API-CONTRACT.md` — API contract.
- `docs/DATABASE-DESIGN.md` — database design.
- `docs/AI-SERVICE-CONTRACT.md` — AI integration contract.

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm build
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/evalora' pnpm prisma:validate
```

## Separate repository note

This folder is intentionally self-contained so it can be pushed to its own GitHub repository independently from the frontend.
