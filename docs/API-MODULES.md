# Backend API Modules

## Auth

Endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Implemented auth persistence slice:

- Logic adapted from the Coorad backend auth flow: normalize email, hash password, verify password with bcrypt, sign JWT with role claims, and never return password hashes.
- `src/modules/auth/auth.service.ts` exposes `register` and `login` over a repository boundary.
- `PrismaAuthRepository` writes/reads `User` records through Prisma using Evalora's `passwordHash` and role enum fields.
- `src/modules/auth/auth.guard.ts` parses `Authorization: Bearer JWT_TOKEN`, attaches the authenticated user to the request, and provides role-access checks.
- `src/modules/auth/access-control.ts` derives reusable ownership scopes from authenticated `{ userId, role, organizationId }` context.
- `GET /api/auth/me` is protected by `JwtAuthGuard`.

Next auth task:

- Add refresh-token/logout persistence if the project needs server-side session invalidation.

## Templates

Endpoints:

- `GET /api/templates`
- `POST /api/templates`
- `GET /api/templates/:id`
- `PUT /api/templates/:id`
- `DELETE /api/templates/:id`

Implemented template persistence slice:

- `src/modules/templates/templates.service.ts` maps API DTOs to Prisma `AssessmentTemplate`, `AssessmentModule`, and `Question` writes.
- `POST /api/templates` creates nested modules/questions and stores scoring rules.
- `PUT /api/templates/:id` replaces nested modules/questions so edits stay in sync with the template editor.
- `GET /api/templates` and `GET /api/templates/:id` return nested module/question DTOs.
- `src/modules/templates/prebuilt-templates.ts` defines researched starter banks for HR Generalist, Software Engineer, and Team Leader tests with modules, questions, candidate subset sizing, weights, and rubrics.
- `pnpm seed:prebuilt` upserts those prebuilt tests into Neon for the seeded organization scope.
- Template routes require JWT auth; write routes are restricted to `admin` and `organization` roles.
- Ownership hardening: admins can query broadly, while organization/interviewer users are scoped to their JWT `organizationId`.

Next template task:

- Add duplicate-template endpoint if needed by the frontend workflow.

## Sessions

Endpoints:

- `POST /api/sessions`
- `GET /api/sessions`
- `GET /api/sessions/:id`
- `PUT /api/sessions/:id/start`
- `PUT /api/sessions/:id/complete`

Implemented session persistence slice:

- `src/modules/sessions/sessions.service.ts` creates `InterviewSession` records with generated access codes.
- Session DTOs include candidate/template labels from Prisma relations when available.
- `PUT /api/sessions/:id/start` writes `IN_PROGRESS` and `startedAt`.
- `PUT /api/sessions/:id/complete` writes `COMPLETED` and `completedAt`.
- Session routes require JWT auth; create routes are restricted to `admin`, `organization`, and `interviewer` roles.
- Ownership hardening: organization/interviewer users are scoped to their JWT `organizationId`; candidates can only read/update assigned sessions.

Next session task:

- Add candidate access-code lookup/reconnect flow if the frontend needs link-based entry.

## Responses

Endpoints:

- `POST /api/responses`
- `GET /api/responses/session/:sessionId`

Implemented response persistence/autosave slice:

- `src/modules/responses/responses.service.ts` writes `Response` records through Prisma.
- `POST /api/responses` creates a response when no existing `sessionId` + `questionId` answer exists.
- `POST /api/responses` updates the existing `sessionId` + `questionId` answer for autosave.
- `GET /api/responses/session/:sessionId` returns responses ordered by creation time.
- Response routes require JWT auth and allow `admin`, `organization`, `interviewer`, and `candidate` roles.
- Ownership hardening: organization/interviewer users are scoped through the response session's `organizationId`; candidates are scoped through the response session's `candidateId` before autosave writes.

Next response task:

- Add per-module validation when frontend DTOs are finalized.

## AI

Keep provider details hidden behind a service adapter. Controllers call `AiService`; provider prompt and HTTP logic live outside controllers.

Implemented Member 1 slices:

- `src/modules/ai/evaluation.service.ts` keeps deterministic rubric evaluation and report aggregation as a safe fallback.
- `getModuleEvaluationProfile(moduleType)` centralizes default rubrics/focus areas for AI interview, coding, debugging, work-style, behavioral, leadership, communication, and problem-solving modules.
- `src/modules/ai/ai.service.ts` preserves the evaluation/report DTO contract while routing to a provider when available and filling module-specific default rubrics when callers omit them.
- `src/modules/ai/deepseek.provider.ts` calls the OpenAI-compatible DeepSeek V4 Flash `/chat/completions` endpoint and sends module profile guidance for JSON evaluation output.
- `POST /api/ai/evaluate` returns score, criteria scores, feedback, strengths, improvement areas, evidence, and advisory notice using custom or module-default rubrics.
- `POST /api/ai/report` aggregates module evaluations into a candidate report.
- Provider failures fall back to deterministic rubric evaluation instead of crashing the candidate flow.

## Reports

Implemented first Member 1 slice:

- `GET /api/reports/:sessionId` reads a persisted `CandidateReport` row first and maps session candidate/template metadata into the report DTO.
- If no persisted report exists, `GET /api/reports/:sessionId` keeps the generated evidence-based fallback report shape.
- `POST /api/reports/:sessionId/generate` generates the report, attempts to persist `Evaluation` and `CandidateReport` records through Prisma, and returns `persistence.status`.
- Persistence succeeds only when the `sessionId` exists in the database; demo/nonexistent sessions return generated report data with a failed/skipped persistence status instead of crashing.
- Report routes require JWT auth and are restricted to `admin`, `organization`, and `interviewer` roles.
- Ownership hardening: organization/interviewer users are scoped through the report session's `organizationId`; candidates are intentionally blocked from generated evaluation reports in the MVP API.

## Code execution

Use a sandbox/Judge0-style service. Never run submitted code directly in Node.
