# Member 1 Backend Work — Core System, AI Evaluation, and Report Logic

Owner: Long Mengchheang

This document tells team members and AI agents what Member 1 owns in the standalone backend repository.

## Member 1 responsibility from SRS

Member 1 owns:

- Database structure.
- Assessment module logic.
- AI evaluation logic.
- Candidate scoring system.
- Candidate report generation.
- Backend API structure for core features.

## Current implementation slice

Implemented first core logic slice:

- Runtime/provider configuration:
  - AI provider is DeepSeek V4 Flash.
  - Database target is PostgreSQL on Neon.
  - safe runtime config redacts secrets before exposing status.

- `src/modules/ai/evaluation.service.ts`
  - deterministic rubric-based response evaluation helper.
  - module score from 1 to 5.
  - criteria score map.
  - evidence extraction from candidate response text.
  - strengths and improvement areas.
  - advisory AI notice.
  - weighted candidate report aggregation.
  - module-specific evaluation profiles for AI interview, coding, debugging, work-style, behavioral, leadership, communication, and problem-solving rubrics.
- DeepSeek AI adapter slice:
  - `src/modules/ai/ai.service.ts` owns the AI service boundary, preserves DTO contracts, and falls back safely when provider calls fail.
  - `src/modules/ai/deepseek.provider.ts` calls DeepSeek V4 Flash chat completions and parses JSON evaluation output.
  - `src/modules/ai/ai.controller.ts` calls `AiService` for interview questions, follow-ups, response evaluation, and report aggregation.
  - `test/ai.service.test.ts` verifies provider-backed evaluation, deterministic fallback, module-default rubric forwarding, and DeepSeek request/JSON parsing behavior.
- `test/evaluation.service.test.ts`
  - tests bounded deterministic evaluation output.
  - tests weighted report score aggregation and evidence merge.
- `src/modules/reports/reports.controller.ts`
  - `POST /api/reports/:sessionId/generate` now generates from saved candidate responses instead of a static report object.
- Persistence slice:
  - `src/prisma/prisma.service.ts` owns Prisma connection lifecycle.
  - `src/modules/reports/reports.service.ts` loads session responses with their questions/modules, groups responses by module, evaluates each module through `AiService`, then persists `Evaluation` + `CandidateReport` records.
  - `GET /api/reports/:sessionId` now reads persisted `CandidateReport` data first and falls back to generated report data only when no persisted report exists.
  - `test/reports.service.test.ts` verifies saved-response module grouping, Prisma write mapping, and persisted report readback without needing real Neon credentials.
- Report privacy slice:
  - report read/generate/export routes require JWT auth and `admin`, `organization`, or `interviewer` role.
  - organization/interviewer users are scoped through the report session's `organizationId` before reading or generating reports.
  - candidates are intentionally blocked from generated evaluation reports in the MVP API.
- Auth persistence slice:
  - logic adapted from the Coorad backend auth flow.
  - `src/modules/auth/auth.service.ts` normalizes email, hashes passwords with bcrypt, verifies login passwords, signs JWTs with role claims, and strips `passwordHash` from responses.
  - public registration creates interviewer accounts by default and rejects public admin/candidate registration.
  - candidate records are invite-only participants and cannot log in through the platform auth endpoint.
  - `PrismaAuthRepository` persists users through Prisma.
  - `test/auth.service.test.ts` verifies password hashing, JWT role claims, private admin registration, and blocked candidate login.
- Auth guard/RBAC slice:
  - `src/modules/auth/auth.guard.ts` verifies Bearer JWTs, attaches `{ id, email, role, organizationId }` to requests, and provides `Roles`/`RolesGuard` helpers.
  - `src/modules/auth/access-control.ts` derives ownership scopes used by persisted routes.
  - `GET /api/auth/me` now requires a valid JWT.
  - `test/auth.guard.test.ts` verifies token parsing and role rejection.
- Template persistence/prebuilt test slice:
  - `src/modules/templates/templates.service.ts` maps template DTOs to Prisma nested writes for `AssessmentTemplate`, `AssessmentModule`, and `Question`.
  - `src/modules/templates/templates.controller.ts` now uses the service instead of mock template data.
  - `src/modules/templates/prebuilt-templates.ts` provides editable researched question banks for HR Generalist, Software Engineer, and Team Leader roles.
  - `scripts/seed-prebuilt-templates.ts` upserts those prebuilt tests into Neon with modules, candidate subset sizing, questions, weights, and rubrics.
  - Template routes require JWT auth; write routes allow `admin`, `organization`, or `interviewer` role.
  - `test/templates.service.test.ts` verifies nested create/update mapping and DTO conversion without Neon credentials.
  - `test/prebuilt-templates.test.ts` verifies prebuilt template coverage and Prisma seed mapping.
- Session persistence slice:
  - `src/modules/sessions/sessions.service.ts` creates and reads `InterviewSession` records linked to candidate user IDs and template IDs.
  - session creation accepts `candidateName` + `candidateEmail` to create/reuse an invite-only candidate record with a random password hash.
  - session creation generates an access code and starts with `not_started` status.
  - candidate access-code endpoints open/start/complete the assigned assessment without platform login and close after completion/expiry.
  - start/complete endpoints persist `startedAt`, `completedAt`, and status transitions.
  - `test/sessions.service.test.ts` verifies create/list/start/complete Prisma mapping and access-code flow without Neon credentials.
- Response persistence/autosave slice:
  - `src/modules/responses/responses.service.ts` writes `Response` records through Prisma.
  - autosave updates an existing `sessionId` + `questionId` answer when present, otherwise creates a new response.
  - candidate responses can be autosaved through active access codes without JWT and are blocked after completion/expiry.
  - `src/modules/responses/responses.controller.ts` now uses the service instead of mock response data.
  - `test/responses.service.test.ts` verifies create/update autosave, session response listing, and candidate access-code autosave without Neon credentials.
- Ownership hardening slice:
  - templates are scoped by organization for organization/interviewer users.
  - sessions are scoped by organization for organization/interviewer users; candidate-facing access is scoped by active `accessCode` instead of platform login.
  - responses are scoped through the parent session before platform listing/corrections and through active access code for candidate autosave writes.
  - `test/ownership.service.test.ts` verifies scoped Prisma where clauses without Neon credentials.

## Next Member 1 slices

Work in this order:

1. Add duplicate-template/edit-from-prebuilt workflow only if the frontend wants a separate clone endpoint instead of editing a seeded template.
2. Add final frontend integration smoke tests when report UI routes are available.

## Rules

- Keep AI feedback advisory and human-reviewable.
- Do not produce final hiring decisions.
- Do not present behavioral/work-style output as medical diagnosis.
- Never run candidate code inside the API process.
- When route shape changes, update `docs/API-CONTRACT.md`.
- When schema changes, update `docs/DATABASE-DESIGN.md` and `prisma/schema.prisma`.

## Verification for Member 1 changes

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/evalora' pnpm prisma:validate
```
