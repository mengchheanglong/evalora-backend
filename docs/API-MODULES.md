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
- Public registration defaults to the interviewer role, rejects caller-supplied organization IDs, and atomically creates a new organization workspace. It rejects public `admin` and `candidate` registration because admins are private/seeded and candidates use invitation links.
- `login` blocks candidate records so invite-only candidate rows cannot become platform accounts.
- Login repairs legacy interviewer records that do not yet have an organization workspace.
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
- Session creation also accepts optional workspace form fields: title, interview type, interviewers, notes, target role, department, schedule (`scheduledAt` or `sessionDate`+`startTime`), duration, language, and time zone. The authenticated creator is stored as `createdById`.
- Session DTOs include candidate/template labels plus interviewer labels (`interviewerName` / `interviewerRole`) from named interviewers or the session creator.
- Candidate access-code endpoints return the assigned assessment template/modules/questions without a platform JWT.
- Candidate payloads omit scoring rules, rubrics, internal ownership metadata, and coding-bank contents. Question selection is deterministic and restricted again when responses are saved.
- `PUT /api/sessions/:id/start` writes `IN_PROGRESS` and `startedAt`.
- `PUT /api/sessions/:id/complete` writes `COMPLETED` and `completedAt`.
- Platform session routes require JWT auth; create routes are restricted to `admin`, `organization`, and `interviewer` roles.
- Ownership hardening: organization/interviewer users are scoped to their JWT `organizationId`; candidate invite access is scoped by active access code and closes after completion/expiry.
- Access codes use high-entropy random tokens and candidate routes are protected by a fixed-window rate limiter.
- Completion returns immediately with report processing status while report generation continues outside the candidate request.

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

- Response writes require an in-progress session and an assigned question; completed, expired, cross-template, and cross-organization writes are rejected.

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
- Candidate access endpoints persist conversation messages and provide assigned interview/follow-up generation without exposing platform AI routes.

## Reports

Implemented report slice:

- `GET /api/reports/:sessionId` reads a persisted `CandidateReport` row first and maps session candidate/template metadata into the report DTO.
- If no persisted report exists, `GET /api/reports/:sessionId` returns `404` instead of fabricated/demo report data.
- `POST /api/reports/:sessionId/generate` loads the saved session responses with their questions/modules, groups answers by module, evaluates each module through `AiService` with deterministic fallback, then persists fresh `Evaluation` rows and one `CandidateReport`.
- Report generation requires a real saved session. Sessions with no candidate responses return generated report data with `persistence.status = "skipped"` and reason `no candidate responses`.
- Report routes require JWT auth and are restricted to `admin`, `organization`, and `interviewer` roles.
- Ownership hardening: organization/interviewer users are scoped through the report session's `organizationId`; candidates are intentionally blocked from generated evaluation reports in the MVP API.
- Response and coding evaluations run concurrently, and reviewer-note endpoints retain human context alongside the advisory report.

## Code execution

Never run submitted code inside the API process.

- `CodeExecutionService` selects Judge0 by default or an explicitly configured self-hosted Piston instance.
- Candidate assignments contain one deterministic easy, medium, and hard challenge when the bank supports all three levels.
- Candidate run/grade/submit routes require an active access code and are rate limited.
- Hidden test inputs, expected outputs, and actual outputs are stripped from candidate responses and submission history.
- Platform code routes require JWT/RBAC and session ownership.

## Analytics

Endpoints:

- `GET /api/analytics/summary`
- `GET /api/analytics/activity`
- `GET /api/analytics/module-performance`
- `GET /api/analytics/score-distribution`
- `GET /api/analytics/themes`

Analytics are computed from organization-scoped sessions, evaluations, reports, and report evidence. No static demo values are returned.
