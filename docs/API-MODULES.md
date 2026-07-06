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
- `GET /api/auth/me` is protected by `JwtAuthGuard`.

Next auth tasks:

- Apply JWT/role guards to real session, report, template, and admin endpoints as they move from demo data to persistence.
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
- Template routes require JWT auth; write routes are restricted to `admin` and `organization` roles.

Next template tasks:

- Enforce organization ownership in query filters once organization membership is fully connected.
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
- Session routes require JWT auth; create/list routes are restricted to `admin`, `organization`, and `interviewer` roles.

Next session tasks:

- Enforce organization/candidate ownership filters before exposing broad session lists.
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
- Response routes require JWT auth and currently allow `admin`, `organization`, `interviewer`, and `candidate` roles pending ownership filters.

Next response tasks:

- Enforce candidate/session ownership before exposing response lists.
- Add per-module validation when frontend DTOs are finalized.

## AI

Keep provider details hidden behind a service adapter. The controller should not contain prompt logic long-term.

Implemented first Member 1 slice:

- `src/modules/ai/evaluation.service.ts` evaluates response text against rubrics.
- `POST /api/ai/evaluate` returns score, criteria scores, feedback, strengths, improvement areas, evidence, and advisory notice.
- `POST /api/ai/report` aggregates module evaluations into a candidate report.

## Reports

Implemented first Member 1 slice:

- `GET /api/reports/:sessionId` returns a generated evidence-based demo report.
- `POST /api/reports/:sessionId/generate` generates the report, attempts to persist `Evaluation` and `CandidateReport` records through Prisma, and returns `persistence.status`.
- Persistence succeeds only when the `sessionId` exists in the database; demo/nonexistent sessions return generated report data with a failed/skipped persistence status instead of crashing.

## Code execution

Use a sandbox/Judge0-style service. Never run submitted code directly in Node.
