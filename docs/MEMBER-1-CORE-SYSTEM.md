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
- `test/evaluation.service.test.ts`
  - tests bounded evaluation output.
  - tests weighted report score aggregation and evidence merge.
- `src/modules/ai/ai.controller.ts`
  - `POST /api/ai/evaluate` now uses the evaluation service.
  - `POST /api/ai/report` now uses the report generator.
- `src/modules/reports/reports.controller.ts`
  - report endpoints now use generated module evaluations instead of a static report object.
- Persistence slice:
  - `src/prisma/prisma.service.ts` owns Prisma connection lifecycle.
  - `src/modules/reports/reports.service.ts` generates reports and persists `Evaluation` + `CandidateReport` records when a database session exists.
  - `test/reports.service.test.ts` verifies Prisma write mapping without needing real Neon credentials.
- Auth persistence slice:
  - logic adapted from the Coorad backend auth flow.
  - `src/modules/auth/auth.service.ts` normalizes email, hashes passwords with bcrypt, verifies login passwords, signs JWTs with role claims, and strips `passwordHash` from responses.
  - `PrismaAuthRepository` persists users through Prisma.
  - `test/auth.service.test.ts` verifies password hashing and JWT role claims.
- Auth guard/RBAC slice:
  - `src/modules/auth/auth.guard.ts` verifies Bearer JWTs, attaches `{ id, email, role, organizationId }` to requests, and provides `Roles`/`RolesGuard` helpers.
  - `src/modules/auth/access-control.ts` derives ownership scopes used by persisted routes.
  - `GET /api/auth/me` now requires a valid JWT.
  - `test/auth.guard.test.ts` verifies token parsing and role rejection.
- Template persistence slice:
  - `src/modules/templates/templates.service.ts` maps template DTOs to Prisma nested writes for `AssessmentTemplate`, `AssessmentModule`, and `Question`.
  - `src/modules/templates/templates.controller.ts` now uses the service instead of mock template data.
  - Template routes require JWT auth; write routes require `admin` or `organization` role.
  - `test/templates.service.test.ts` verifies nested create/update mapping and DTO conversion without Neon credentials.
- Session persistence slice:
  - `src/modules/sessions/sessions.service.ts` creates and reads `InterviewSession` records linked to candidate user IDs and template IDs.
  - session creation generates an access code and starts with `not_started` status.
  - start/complete endpoints persist `startedAt`, `completedAt`, and status transitions.
  - `test/sessions.service.test.ts` verifies create/list/start/complete Prisma mapping without Neon credentials.
- Response persistence/autosave slice:
  - `src/modules/responses/responses.service.ts` writes `Response` records through Prisma.
  - autosave updates an existing `sessionId` + `questionId` answer when present, otherwise creates a new response.
  - `src/modules/responses/responses.controller.ts` now uses the service instead of mock response data.
  - `test/responses.service.test.ts` verifies create/update autosave and session response listing without Neon credentials.
- Ownership hardening slice:
  - templates are scoped by organization for organization/interviewer users.
  - sessions are scoped by organization for organization/interviewer users and by `candidateId` for candidates.
  - responses are scoped through the parent session before listing or autosave writes.
  - `test/ownership.service.test.ts` verifies scoped Prisma where clauses without Neon credentials.

## Next Member 1 slices

Work in this order:

1. Add candidate access-code lookup/reconnect flow if needed by frontend.
2. Apply JWT/role guards to persisted report and admin endpoints as they become real database routes.
3. Replace deterministic evaluation with a DeepSeek V4 Flash provider adapter while keeping the same output contract.

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
