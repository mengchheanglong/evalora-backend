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
- Public registration defaults to the interviewer role. It rejects public `admin` and `candidate` registration because admins are private/seeded and candidates use invite links/access codes.
- `login` blocks candidate records so invite-only candidate rows cannot become platform accounts.
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
- `src/modules/templates/prebuilt-templates.ts` re-exports researched starter banks from `src/modules/templates/prebuilt/`, where each role/module has its own file for maintainability.
- `pnpm seed:prebuilt` upserts those prebuilt tests into Neon for the seeded organization scope.
- Template routes require JWT auth; write routes allow `admin`, `organization`, and `interviewer` roles.
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
- `GET /api/sessions/access/:accessCode`
- `PUT /api/sessions/access/:accessCode/start`
- `PUT /api/sessions/access/:accessCode/complete`

Implemented session persistence slice:

- `src/modules/sessions/sessions.service.ts` creates `InterviewSession` records with generated access codes.
- Session creation accepts either an existing `candidateId` or candidate name/email. Name/email creation stores an invite-only candidate user row with a random password hash, not a platform login.
- Session DTOs include candidate/template labels from Prisma relations when available.
- Candidate access-code endpoints return the assigned assessment template/modules/questions without a platform JWT.
- `PUT /api/sessions/:id/start` writes `IN_PROGRESS` and `startedAt`.
- `PUT /api/sessions/:id/complete` writes `COMPLETED` and `completedAt`.
- Platform session routes require JWT auth; create routes are restricted to `admin`, `organization`, and `interviewer` roles.
- Ownership hardening: organization/interviewer users are scoped to their JWT `organizationId`; candidate invite access is scoped by active access code and closes after completion/expiry.

## Responses

Endpoints:

- `POST /api/responses`
- `GET /api/responses/session/:sessionId`
- `POST /api/responses/access/:accessCode`
- `GET /api/responses/access/:accessCode`

Implemented response persistence/autosave slice:

- `src/modules/responses/responses.service.ts` writes `Response` records through Prisma.
- `POST /api/responses` creates a response when no existing `sessionId` + `questionId` answer exists.
- `POST /api/responses` updates the existing `sessionId` + `questionId` answer for autosave.
- `POST /api/responses/access/:accessCode` lets candidates autosave through the invite link without logging in.
- `GET /api/responses/access/:accessCode` lets candidates reload saved answers only while the session remains active.
- `GET /api/responses/session/:sessionId` returns responses ordered by creation time.
- Platform response routes require JWT auth for admin/interviewer review/corrections.
- Ownership hardening: organization/interviewer users are scoped through the response session's `organizationId`; candidate invite writes are scoped by active access code and blocked after completion/expiry.

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
- `POST /api/reports/:sessionId/generate` loads the saved session responses with their questions/modules, groups answers by module, evaluates each module through `AiService` with deterministic fallback, then persists fresh `Evaluation` rows and one `CandidateReport`.
- Report generation requires a real saved session. Sessions with no candidate responses return generated report data with `persistence.status = "skipped"` and reason `no candidate responses`.
- Report routes require JWT auth and are restricted to `admin`, `organization`, and `interviewer` roles.
- Ownership hardening: organization/interviewer users are scoped through the report session's `organizationId`; candidates are intentionally blocked from generated evaluation reports in the MVP API.

## Code execution

Use a sandbox/Judge0-style service. Never run submitted code directly in Node.
