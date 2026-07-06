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
- `src/modules/auth/auth.guard.ts` parses `Authorization: Bearer <jwt>`, attaches the authenticated user to the request, and provides role-access checks.
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

Implementation tasks:

- Persist templates, modules, questions, scoring rules.
- Support edit/duplicate/delete.
- Enforce organization ownership.

## Sessions

Endpoints:

- `POST /api/sessions`
- `GET /api/sessions`
- `GET /api/sessions/:id`
- `PUT /api/sessions/:id/start`
- `PUT /api/sessions/:id/complete`

Implementation tasks:

- Generate secure access code/link.
- Track status and timestamps.
- Save progress and reconnect state.

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
