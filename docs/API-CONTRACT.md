# Evalora API Contract

Local backend base URL:

```text
http://localhost:4000/api
```

The frontend reads `NEXT_PUBLIC_API_URL` and proxies browser requests through `/api/backend/*`. The proxy stores the JWT in an HttpOnly, SameSite=Lax cookie and adds the bearer token to protected backend requests.

## Conventions

- MVP responses are JSON.
- Missing or invalid authentication returns `401`; insufficient role/scope returns `403`.
- Invalid input returns `400`, conflicts return `409`, expired access returns `410`, and missing resources return `404`.
- Candidate access codes are private, high-entropy invitation credentials and stop working after completion or expiry.
- Organization/interviewer access is scoped to the organization in the JWT. Public clients cannot choose an arbitrary organization ID.
- AI feedback is advisory. Candidate-facing payloads never expose rubrics, scoring rules, hidden tests, or reviewer reports.

## Authentication

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public | Create an unverified **workspace owner** and organization, then send a verification email. |
| POST | `/auth/verify-email` | Public | Verify a registration token, then return a signed JWT and safe user object. |
| POST | `/auth/resend-email-verification` | Public | Send a new verification link. Always returns a generic response. |
| POST | `/auth/login` | Public | Return a signed JWT and safe user object. Accepts optional `remember`; `true` extends the JWT to 30 days. |
| POST | `/auth/google` | Public | Verify a Google Identity Services ID token, then login or create a workspace owner. Accepts the same optional `remember` flag. |
| POST | `/auth/forgot-password` | Public | Start password reset for a workspace account. Always returns a generic success message. |
| POST | `/auth/reset-password` | Public | Set a new password using a one-time reset token from email (or demo `resetUrl`). |
| POST | `/auth/logout` | Public | Acknowledge logout; the frontend proxy clears its cookie. |
| GET | `/auth/me` | Workspace | Return the current persisted user. |

Registration request:

```json
{
  "name": "Demo Owner",
  "email": "owner@example.com",
  "password": "SecurePass1",
  "organizationName": "Demo Workspace"
}
```

Public registration always creates the workspace **owner** (`role: "organization"`). Interviewers join only through invitations. Public `admin`/`candidate` registration and public `organizationId` assignment are rejected. Registration returns `{ "email": "...", "requiresEmailVerification": true, "emailDelivery": { ... } }` and does not create a session. The signed verification link expires after 15 minutes and is invalidated when the account password changes. Successful verification, login, and Google responses contain `{ "token": "...", "user": { ... } }`; the frontend proxy removes `token` and stores it in the HttpOnly cookie.

Email verification requests:

```json
{ "token": "verification-token-from-email" }
```

```json
{ "email": "owner@example.com" }
```

Unverified password accounts receive `401` from login until verification succeeds. Resend responses are deliberately generic to avoid revealing whether an account exists. In non-production environments only, registration/resend may include `verificationUrl` when email delivery is unavailable.

Google sign-in request:

```json
{
  "credential": "google-identity-services-id-token",
  "organizationName": "Optional workspace name for first-time signup"
}
```

`POST /auth/google` verifies the ID token against `GOOGLE_CLIENT_ID`, requires a verified email, blocks candidate-only emails, logs in existing workspace users, and creates a new **owner** workspace when the email is new. The frontend proxy also treats `auth/google` as an auth response path and stores the JWT cookie.

Password reset request:

```json
{ "email": "owner@example.com" }
```

Response shape:

```json
{
  "message": "If an account exists for that email, password reset instructions have been sent.",
  "emailDelivery": { "status": "sent|skipped|failed", "reason": "optional" },
  "resetUrl": "http://localhost:3010/reset-password?token=... optional when email was not sent"
}
```

Reset tokens are short-lived JWTs (1 hour) bound to the current password hash fingerprint, so a successful reset invalidates older links. Candidate invite-only rows cannot reset a platform password.

Password reset confirm:

```json
{
  "token": "reset-token-from-email-or-resetUrl",
  "password": "SecurePass1"
}
```

Workspace passwords must be 8–128 characters and include at least one uppercase letter, one lowercase letter, and one number. The same policy applies to register, invite accept, and password reset.

## Organization members and invites

One organization can have many workspace users. The first registrant is the **owner**. Owners invite **interviewers** who share the same `organizationId` data (templates, sessions, reports, analytics).

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| GET | `/organization` | Owner, interviewer | Current workspace profile (name, member count, owner). |
| PUT | `/organization` | Owner | Rename the workspace (`{ "name": "Acme Hiring" }`). |
| GET | `/organization/privacy` | Owner, interviewer | Live data counts and retention policy for Settings. |
| GET | `/organization/export` | Owner | Full JSON export of members, templates, sessions, and reports. |
| DELETE | `/organization/data` | Owner | Wipe templates, sessions, and invites. Body: `{ "confirmName": "<exact org name>" }`. Keeps accounts. |
| GET | `/organization/members` | Owner, interviewer | List workspace members (owner + interviewers). |
| POST | `/organization/invites` | Owner | Create a pending interviewer invite; returns `token` and `inviteUrlPath`. |
| GET | `/organization/invites` | Owner | List recent invites for the workspace. |
| DELETE | `/organization/invites/:inviteId` | Owner | Cancel a pending invite. |
| DELETE | `/organization/members/:memberId` | Owner | Remove an interviewer from the workspace (owner cannot be removed). |
| GET | `/organization/invites/token/:token` | Public | Preview a valid invite (email, org name, expiry). |
| POST | `/organization/invites/accept` | Public | Accept invite with name + password; creates interviewer and returns JWT like login. |

Create invite request:

```json
{ "email": "colleague@example.com" }
```

Accept invite request:

```json
{
  "token": "invite-token-from-link",
  "name": "Alex Interviewer",
  "password": "SecurePass1"
}
```

Invite links are high-entropy, expire after 7 days, and are single-use. When email is configured (`EMAIL_PROVIDER=gmail` with SMTP credentials, or `RESEND_API_KEY`), `POST /organization/invites` emails the absolute `inviteUrl` and returns `emailDelivery: { status: "sent" | "skipped" | "failed", reason?, messageId?, provider? }`. Gmail SMTP can reach any recipient within Google’s limits; Resend’s `onboarding@resend.dev` sender can only mail the Resend account email unless a domain is verified. Without a provider, invite creation still succeeds with `emailDelivery.status = "skipped"` so the owner can copy `inviteUrlPath` / `inviteUrl` manually. The frontend proxy treats `organization/invites/accept` as an auth response path and stores the JWT in the HttpOnly cookie.

Role labels for UI:

| API `role` | Product meaning |
| --- | --- |
| `organization` | Workspace owner (company admin) |
| `interviewer` | Invited teammate |
| `candidate` | Invite-only assessment participant (not a workspace member) |

## Templates

All template routes require workspace authentication.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/templates/catalog` | List **prebuilt blueprints** (read-only library; not org-owned). |
| GET | `/templates/catalog/:catalogId` | Full prebuilt template for preview. |
| POST | `/templates/from-catalog` | Deep-clone a prebuilt into the caller's organization (ready to assign or edit). |
| GET | `/templates` | List **organization-owned** templates. |
| POST | `/templates` | Create a nested template (blank or custom). |
| POST | `/templates/:id/duplicate` | Duplicate an org-owned template in the same workspace. |
| GET | `/templates/:id` | Read one scoped org template. |
| PUT | `/templates/:id` | Replace template fields and nested modules/questions. |
| DELETE | `/templates/:id` | Delete one scoped template. |

Clone request:

```json
{
  "catalogId": "prebuilt-software-engineer-assessment",
  "title": "Optional custom title for my copy"
}
```

`POST /templates/from-catalog` creates new UUIDs for the template, modules, and questions under the JWT organization. Editing that copy never changes the shared catalog. Sessions should only reference org-owned template ids.

The backend derives `createdById` and organization ownership from the JWT. A template contains title, description, target role, time limit, scoring rules, ordered modules, weights, settings, and questions.

## AI-assisted template drafts

All draft routes require workspace authentication and are scoped to the JWT organization. They are registered ahead of `/templates/:id` so `drafts` is never read as a template id.

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/templates/drafts` | Generate a draft from an uploaded job description or a written idea. Rate limited per user. |
| GET | `/templates/drafts` | List draft summaries for the workspace. |
| GET | `/templates/drafts/:id` | Read one draft plus the original AI proposal. |
| PATCH | `/templates/drafts/:id` | Replace the editable draft. Re-validated and re-weighted. |
| POST | `/templates/drafts/:id/confirm` | Create the real template from the stored draft. |
| DELETE | `/templates/drafts/:id` | Discard a draft. |

**A draft is not an assessment.** Generation writes only an `AssessmentTemplateDraft`; no template, module, or question row exists until a workspace user calls `confirm`. That endpoint is the only path from generated content to an assignable template.

`POST /templates/drafts` accepts either `multipart/form-data` with a `document` file (PDF, DOCX, or plain text, max 5 MB) plus optional `idea` and `roleType` fields, or JSON:

```json
{ "idea": "Backend engineer owning our payments service", "roleType": "Backend Engineer" }
```

The response carries the draft, the untouched AI proposal for comparison, and `provider` (`"deepseek"`, or `"fallback"` when the model was unavailable and Evalora started from its closest prebuilt blueprint):

```json
{
  "id": "…",
  "status": "draft",
  "source": "document",
  "sourceFileName": "backend-engineer.pdf",
  "provider": "deepseek",
  "draft": {
    "title": "Backend Engineer Assessment",
    "roleType": "Backend Engineer",
    "timeLimitMin": 90,
    "modules": [
      {
        "key": "module-1",
        "type": "coding",
        "title": "Coding Assessment",
        "weight": 40,
        "weightRationale": "Service implementation is the core of this role.",
        "weightSignals": { "roleImportance": 5, "riskIfWeak": 5, "evidenceVolume": 4, "difficulty": 4, "essential": true },
        "questions": [{ "key": "module-1-question-1", "questionText": "…", "questionType": "coding", "rubric": ["correctness"] }]
      }
    ],
    "warnings": []
  },
  "aiProposal": { "…": "the proposal as generated, before any edit" }
}
```

Module weights are **integer percentages that always total exactly 100**. The model rates each module on the five `weightSignals` (1-5) and explains the rating; the backend converts those ratings into percentages, applies minimum weights, and rounds so the total is exact. Weights sent in a request are treated as relative intent and rebalanced — a client cannot store a set that misses 100. `warnings` reports what validation changed (dropped modules, clamped limits, rebalanced weights) so a reviewer sees every silent edit.

Uploaded documents are untrusted. The file type is decided by inspecting its bytes rather than the declared MIME type, extracted text is capped, and everything the model returns is validated against the supported module and question types before it becomes draft content.

Errors: `400` for an unreadable or unsupported file and for a draft with no modules; `409` when a draft has already been published or discarded; `429` when the per-user generation limit is hit (`DRAFT_RATE_LIMIT_MAX`, default 10 per hour).

## Sessions

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| POST | `/sessions` | Workspace | Create/reuse an invite-only candidate and assign a scoped template; emails the assessment link when Resend is configured (`emailDelivery` on the response). |
| GET | `/sessions` | Workspace | List scoped sessions; optional `candidateId`, `templateId`, and `status` filters. |
| GET | `/sessions/:id` | Workspace | Read one session with candidate/template labels and report readiness. |
| PUT | `/sessions/:id/start` | Workspace | Start a not-started session; idempotent while in progress. |
| PUT | `/sessions/:id/complete` | Workspace | Complete a session and queue report generation. |
| DELETE | `/sessions/:id` | Workspace | Permanently delete a scoped session and its cascaded responses, submissions, evaluations, report, and notes. |
| GET | `/sessions/:id/integrity-events` | Workspace | Official integrity summary (warning count, warning limit, status) plus the event timeline for one session. |
| PATCH | `/sessions/:id/integrity-policy` | Workspace | Enable or pause all integrity detection for one session. The body is `{ "detectionEnabled": boolean }`. When paused, no events are counted and warningCount is unchanged. |
| GET | `/sessions/access/:accessCode` | Candidate link | Read the sanitized assigned assessment while access is open. |
| PUT | `/sessions/access/:accessCode/start` | Candidate link | Start the assigned assessment. |
| PUT | `/sessions/access/:accessCode/complete` | Candidate link | Complete the assessment and immediately return `reportStatus: "pending"`. |
| PUT | `/sessions/access/:accessCode/timeout` | Candidate link | Mark an in-progress timed assessment `expired` (shown as "Withdrawn / Rejected") once its time limit has elapsed. Server re-checks elapsed time; idempotent for finished sessions. |
| POST | `/sessions/access/:accessCode/integrity-events` | Candidate link | Report a browser-detected integrity signal (visibility change, blur, page hide, exit attempt). The backend deduplicates by `sessionId + clientEventId`, decides `counted` from the event type, and enforces the two-strike policy: the first counted event increments `warningCount` to 1 and keeps the session active; the second counted event reaches `warningLimit` (default 2) and expires the session. |

Candidate integrity-event request (the body ONLY accepts these fields; `warningCount`, `status`, or any enforcement value is rejected):

```json
{
  "clientEventId": "c66e6b0a-1111-4222-8333-444455556666",
  "type": "visibilitychange",
  "detectedAt": "2026-07-06T13:05:00.000Z",
  "returnedAt": "2026-07-06T13:05:30.000Z",
  "durationMs": 30000
}
```

Response carries only official values (`counted`, `warningCount`, `warningLimit`, `sessionStatus`, `action` — `warned` on the first strike, `terminated` on the second — server-authored `reason`, and the stored `event`); the browser never supplies a count or a final action. `visibilitychange` is the only counted type — `blur`/`pagehide`/`beforeunload` are stored as supporting evidence and never increment the warning. Completed/expired sessions reject new events, and a duplicate `clientEventId` returns the stored event without counting again. `warningLimit` defaults to 2: the first counted event warns while the session stays active; the second counted event ends the session.

Session creation request:

```json
{
  "candidateName": "Dara Candidate",
  "candidateEmail": "dara@example.com",
  "templateId": "template-id",
  "expiresAt": "2026-08-01T23:59:59.999Z",
  "title": "Final Round with Dara",
  "interviewType": "Technical Interview",
  "interviewers": ["Sophia Kim", "Michael Chen"],
  "notes": "Focus on system design.",
  "targetRole": "Backend Engineer",
  "department": "Engineering",
  "sessionDate": "2026-07-20",
  "startTime": "14:30",
  "durationMin": 90,
  "language": "English",
  "timeZone": "GMT+07:00 Phnom Penh"
}
```

Optional workspace metadata fields are stored on the session and returned from list/detail reads:

- `title`, `interviewType`, `interviewers`, `notes`, `targetRole`, `department`
- `scheduledAt` (ISO) or `sessionDate` + `startTime` (`HH:mm`) combined server-side
- `durationMin`, `language`, `timeZone`
- `createdById` is set from the authenticated workspace user
- list/detail also expose `interviewerName` / `interviewerRole` (first named interviewer, else session creator)

Candidate session payloads omit template scoring rules, question rubrics, internal ownership fields, and coding-bank contents. Non-coding questions are selected deterministically from the assigned template; coding questions come from the dedicated coding endpoints.

## Responses

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| POST | `/responses` | Workspace | Upsert a response for a scoped, in-progress session. |
| GET | `/responses/session/:sessionId` | Workspace | List saved response evidence. |
| POST | `/responses/access/:accessCode` | Candidate link | Autosave an assigned question while the session is in progress. |
| GET | `/responses/access/:accessCode` | Candidate link | Restore saved answers while access is open. |

Writes use `sessionId` where applicable, `questionId`, `responseText`, and optional `responseJson`. A question must belong to the deterministic candidate assignment. The backend updates the existing session/question row for autosave and returns its persisted `savedAt` timestamp.

## AI

Platform AI routes require workspace authentication:

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/ai/interview-question` | Generate a role/template-aware interview prompt. |
| POST | `/ai/follow-up` | Generate a concise follow-up from one answer. |
| POST | `/ai/evaluate` | Produce rubric evidence and a 1-5 advisory score. |
| POST | `/ai/report` | Aggregate supplied module evaluations. |

Candidate AI routes are access-code scoped and rate limited:

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/ai/access/:accessCode/conversation` | Read persisted candidate/assistant messages. |
| POST | `/ai/access/:accessCode/interview-question` | Generate and persist an assigned interview question. |
| POST | `/ai/access/:accessCode/follow-up` | Generate and persist one answer-aware follow-up. |

DeepSeek is used when configured. Provider errors fall back to deterministic, evidence-based behavior so assessment progress is preserved.

## Coding

Platform coding routes require workspace authentication; candidate routes require an active access code. Execution routes are rate limited.

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| GET | `/code/questions` | Workspace | List the public coding bank without hidden cases. |
| POST | `/code/run` | Workspace | Execute JavaScript against supplied stdin. |
| POST | `/code/grade` | Workspace | Grade against hidden cases without persisting. |
| POST | `/code/submit` | Workspace | Grade and persist a scoped session submission. |
| GET | `/code/submissions/:sessionId` | Workspace | List scoped submissions. |
| GET | `/code/access/:accessCode/questions` | Candidate link | Return a deterministic easy/medium/hard challenge set. |
| POST | `/code/access/:accessCode/run` | Candidate link | Run sample input. |
| POST | `/code/access/:accessCode/grade` | Candidate link | Grade an assigned challenge with redacted case results. |
| POST | `/code/access/:accessCode/submit` | Candidate link | Grade and persist an assigned challenge. |
| GET | `/code/access/:accessCode/submissions` | Candidate link | Restore the candidate's own submissions without hidden test JSON. |

JavaScript source is capped at 64,000 characters and stdin at 16,000. Judge0 CE is the local default execution adapter; a capacity-controlled Judge0 or self-hosted Piston instance should be configured for production. Candidate grade responses expose case number, pass/fail, status, and execution time, never hidden input or expected/actual output.

## Reports

All report routes require workspace authentication and organization ownership.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/reports/:sessionId` | Return a persisted report or `404` while not ready. |
| POST | `/reports/:sessionId/generate` | Evaluate saved response/code evidence and upsert the report. |
| GET | `/reports/:sessionId/export` | Return the current not-implemented export state. |
| GET | `/reports/:sessionId/notes` | List human reviewer notes. |
| POST | `/reports/:sessionId/notes` | Add a scoped reviewer note. |

Report generation evaluates modules concurrently, persists fresh `Evaluation` rows plus one `CandidateReport`, and returns `persistence.status` as `persisted`, `skipped`, or `failed`. Reports include advisory notice, 1-5 overall/module scores, strengths, deeper-review areas, and direct response/code evidence.

## Analytics

Workspace analytics are computed from persisted data visible to the authenticated staff user. Owners and interviewers share one metric catalog; authorization only changes which records are visible. Candidate users have no staff analytics access. Overview values are all-time snapshots and include an `asOf` timestamp; rates are `null`, not zero, when no valid denominator exists.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/analytics/summary` | All-time population, pipeline, closed-session completion, and report-coverage counts/rates. |
| GET | `/analytics/activity` | Recent invitation/progress/completion/report-ready session updates for Overview. |
| GET | `/analytics/ready-reports` | Recently created or regenerated persisted reports, ordered by report update time. |
| GET | `/analytics/upcoming` | Next not-started or in-progress assessments for Overview. |
| GET | `/analytics/template-usage` | Authorized assignment and completion counts by template. |
| GET | `/analytics/module-performance?templateId=:id` | Persisted evaluation averages by module type for one exact template. `templateId` is required. |
| GET | `/analytics/score-distribution?templateId=:id` | Persisted report score buckets for one exact template. `templateId` is required. |
| GET | `/analytics/completion-duration?templateId=:id` | Median minutes and duration buckets for completed sessions using one exact template. `templateId` is required. |

`GET /analytics/activity` uses the actual lifecycle time for each current state: invitation creation, assessment start, completion, or expiry. It does not use a later database reconciliation/update time as the activity timestamp.

`GET /analytics/summary` returns:

- scope metadata: `asOf`, `dataWindow: "all_time"`, and `scope: "organization" | "platform"`;
- population: `totalCandidates`, `totalTemplates`, and `totalSessions`;
- pipeline: completed, in-progress, pending/not-started, expired, active, and closed counts;
- report readiness: `reportReadyAssessments`, `reportsPending`, and `reportCoverageRate`;
- outcome rate: `closedCompletionRate` (`completed / (completed + expired)`); active sessions are excluded from this denominator;
- current status breakdown. Candidate identity and mixed-template evidence are excluded from this aggregate payload.

Score, module, and duration endpoints use completed sessions for exactly one required, nonblank `templateId`, so different template IDs are never combined in a comparison. Historical template revisions are not yet versioned; evidence for an edited template must therefore be interpreted cautiously. Distribution includes a distinct `No assessable evidence` bucket for exact zero scores. Duration excludes missing, invalid, or negative timestamp pairs and reports its sample size. Template usage is assignment context, not candidate performance. Activity is a current-state session update feed, not an immutable event log.

## Alignment checklist

When a route changes:

1. Update backend controller/service and tests.
2. Update frontend API type and consumer.
3. Update both repositories' `docs/API-CONTRACT.md`.
4. Run each repository's required verification commands.
