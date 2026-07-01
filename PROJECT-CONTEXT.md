# Evalora Backend Project Context

This folder is the **standalone backend repository** for Evalora. Push this folder by itself to the backend GitHub repository.

## Product

Evalora is an AI-powered candidate assessment platform for AI interviews, coding assessments, behavioral/work-style questions, leadership scenarios, communication tasks, dashboards, and candidate reports.

## This repo owns

- NestJS API under `/api`.
- Authentication and role-based access control.
- Prisma/PostgreSQL database schema.
- Assessment templates, modules, questions, and sessions.
- Candidate responses and progress saving.
- AI provider integration boundary.
- Code execution sandbox/Judge0 integration boundary.
- Evaluation, scoring, report generation, reviewer notes, and analytics.

## This repo does not own

- Page layout and visual UI.
- Candidate-facing form styling.
- Dashboard chart presentation.

Those belong in the frontend repository.

## Tech stack

- NestJS.
- TypeScript.
- Prisma.
- PostgreSQL.
- JWT auth.

## Important docs in this repo

- `AGENTS.md` — rules for AI agents and team members.
- `README.md` — setup and run commands.
- `docs/SRS.md` — product requirements.
- `docs/API-CONTRACT.md` — API contract shared with frontend.
- `docs/DATABASE-DESIGN.md` — entity design.
- `docs/API-MODULES.md` — backend module plan.
- `docs/AI-SERVICE-CONTRACT.md` — AI provider boundary and safety rules.
- `docs/DATABASE-PRISMA.md` — Prisma workflow.

## Run

```bash
pnpm install
cp .env.example .env
pnpm prisma:generate
pnpm dev
```

Default local API:

```text
http://localhost:4000/api
```

## Verify

```bash
pnpm typecheck
pnpm lint
pnpm build
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/evalora' pnpm prisma:validate
```

## Security and AI safety rules

- Store password hashes only, never raw passwords.
- Store secrets in `.env`, never in committed files.
- Protect reports and candidate data with role checks.
- Never run untrusted candidate code directly inside the API process.
- AI feedback must be advisory, evidence-based, and human-reviewable.
- Do not produce medical or mental health diagnosis from behavioral/work-style answers.

## GitHub push

This folder is self-contained. Initialize Git here, not in the parent folder:

```bash
git init
git add .
git commit -m "init evalora backend"
```
