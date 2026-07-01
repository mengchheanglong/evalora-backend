# Evalora Backend Agent Guide

This repository is the standalone backend for Evalora. Read this file before changing code.

## Product source of truth

1. `docs/SRS.md` — requirements and MVP scope.
2. `docs/API-CONTRACT.md` — API contract shared with frontend.
3. `docs/DATABASE-DESIGN.md` — data model and entity relationships.
4. `docs/API-MODULES.md` — backend module map.
5. `docs/AI-SERVICE-CONTRACT.md` — AI provider boundary and safety rules.
6. `docs/DATABASE-PRISMA.md` — Prisma notes.

Evalora is the product name. InterviewAI 360 is historical/detail source material only.

## Path policy

Use repo-relative paths in docs and code. Do not commit machine-specific absolute paths.

## Backend intent

Build a secure, modular NestJS API for Evalora. The backend owns data protection, RBAC, AI evaluation boundaries, report generation, and code execution safety.

## API conventions

- Global prefix: `/api`.
- Keep route groups aligned with `docs/API-CONTRACT.md`.
- Validate input DTOs before persistence.
- Protect role-specific routes before exposing candidate/session/report data.
- Return clear error messages for invalid session, expired session, AI failure, and code timeout.

## Module boundaries

- Auth: password hashing, JWT issuance, role claims.
- Templates: assessment template and module CRUD.
- Sessions: assignment, status, access code, progress.
- Responses: candidate answers and autosave.
- AI: provider adapter, prompt/rubric logic, fallback behavior.
- Code: sandbox/Judge0 adapter only; never direct untrusted execution.
- Reports: aggregate evaluations, evidence, reviewer notes.
- Analytics: dashboard metrics and filtering.

## Data rules

- Store password hashes only.
- Store secrets only in environment variables.
- Reports are private and require authorization.
- AI feedback must include evidence and advisory language.
- Behavioral/work-style output must not be medical/mental health diagnosis.

## Verification

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm build
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/evalora' pnpm prisma:validate
```

If Prisma schema changes, update `docs/DATABASE-DESIGN.md`.
If route shape changes, update `docs/API-CONTRACT.md`.

## Separate repository note

This folder is intentionally self-contained so it can be pushed to its own GitHub repository independently from the frontend.
