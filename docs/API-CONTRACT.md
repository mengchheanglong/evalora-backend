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
| POST | `/auth/register` | Public | Create an interviewer account and workspace. |
| POST | `/auth/login` | Public | Return a signed JWT and safe user object. |
| POST | `/auth/logout` | Public | Acknowledge logout; the frontend proxy clears its cookie. |
| GET | `/auth/me` | Workspace | Return the current persisted user. |

Registration request:

```json
{
  "name": "Demo Reviewer",
  "email": "reviewer@example.com",
  "password": "minimum-8-characters",
  "organizationName": "Demo Workspace"
}
```

`role` may be omitted and defaults to `interviewer`. Public `admin`/`candidate` registration and public `organizationId` assignment are rejected. Successful login/register responses contain `{ "token": "...", "user": { ... } }`; the frontend proxy removes `token` before returning JSON to client components.

## Templates

All template routes require workspace authentication.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/templates` | List organization-visible templates with modules/questions. |
| POST | `/templates` | Create a nested template. |
| GET | `/templates/:id` | Read one scoped template. |
| PUT | `/templates/:id` | Replace template fields and nested modules/questions. |
| DELETE | `/templates/:id` | Delete one scoped template. |

The backend derives `createdById` and organization ownership from the JWT. A template contains title, description, target role, time limit, scoring rules, ordered modules, weights, settings, and questions.

## Sessions

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| POST | `/sessions` | Workspace | Create/reuse an invite-only candidate and assign a scoped template. |
| GET | `/sessions` | Workspace | List scoped sessions; optional `candidateId`, `templateId`, and `status` filters. |
| GET | `/sessions/:id` | Workspace | Read one session with candidate/template labels and report readiness. |
| PUT | `/sessions/:id/start` | Workspace | Start a not-started session; idempotent while in progress. |
| PUT | `/sessions/:id/complete` | Workspace | Complete a session and queue report generation. |
| GET | `/sessions/access/:accessCode` | Candidate link | Read the sanitized assigned assessment while access is open. |
| PUT | `/sessions/access/:accessCode/start` | Candidate link | Start the assigned assessment. |
| PUT | `/sessions/access/:accessCode/complete` | Candidate link | Complete the assessment and immediately return `reportStatus: "pending"`. |

Session creation request:

```json
{
  "candidateName": "Dara Candidate",
  "candidateEmail": "dara@example.com",
  "templateId": "template-id",
  "expiresAt": "2026-08-01T23:59:59.999Z"
}
```

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

All analytics are computed from organization-scoped persisted data.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/analytics/summary` | Candidate/session counts, completion rate, average score, recent completions, module performance. |
| GET | `/analytics/activity` | Recent invitation/progress/completion activity. |
| GET | `/analytics/module-performance` | Average persisted evaluation score by module. |
| GET | `/analytics/score-distribution` | Persisted report score buckets. |
| GET | `/analytics/themes` | Common evidence-backed strengths and deeper-review themes. |

## Alignment checklist

When a route changes:

1. Update backend controller/service and tests.
2. Update frontend API type and consumer.
3. Update both repositories' `docs/API-CONTRACT.md`.
4. Run each repository's required verification commands.
