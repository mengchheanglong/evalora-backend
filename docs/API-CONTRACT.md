# Evalora API Contract

Base URL in local development:

```text
http://localhost:4000/api
```

Frontend code should read the backend URL from `NEXT_PUBLIC_API_URL` and default to the local base URL.

## Response conventions

- JSON only for MVP.
- Authenticated endpoints return `401` for missing/invalid token.
- Role-restricted endpoints return `403` for valid user without permission.
- Validation errors return `400` with a clear message.
- AI/sandbox errors should return a safe fallback message and preserve progress.

## Auth

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/auth/register` | Register user with name, email, password, role. |
| POST | `/auth/login` | Log in and receive token/user info. |
| POST | `/auth/logout` | End session/token client-side or server-side when implemented. |
| GET | `/auth/me` | Return current authenticated user. |

## Assessment templates

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/templates` | List templates visible to current organization/admin. |
| POST | `/templates` | Create template. |
| GET | `/templates/:id` | Get template details including modules/questions. |
| PUT | `/templates/:id` | Update template. |
| DELETE | `/templates/:id` | Delete template. |

## Interview sessions

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/sessions` | Create candidate session from template. |
| GET | `/sessions` | List sessions visible to current user. |
| GET | `/sessions/:id` | Get session details. |
| PUT | `/sessions/:id/start` | Mark session in progress. |
| PUT | `/sessions/:id/complete` | Complete session and trigger evaluation/report workflow. |

## Responses

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/responses` | Submit or autosave candidate response. |
| GET | `/responses/session/:sessionId` | Get responses for one session. |

## AI

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/ai/interview-question` | Generate role/template-based interview question. |
| POST | `/ai/follow-up` | Generate follow-up based on candidate answer. |
| POST | `/ai/evaluate` | Evaluate one response/module using rubric. |
| POST | `/ai/report` | Generate final report summary. |

## Coding

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/code/questions` | List coding questions (public sample only; hidden grading test cases are never returned, `testCaseCount` indicates how many exist). |
| POST | `/code/run` | Run candidate code in the sandbox against optional stdin. Rate limited per client IP. |
| POST | `/code/grade` | Grade code against a question's hidden test cases without persisting. Rate limited per client IP. |
| POST | `/code/submit` | Grade and persist a candidate submission for a session. Rejected (409) if the session is completed, (410) if expired. Rate limited per client IP. |
| GET | `/code/submissions/:sessionId` | List code submissions for one session. |

Code execution requests cap `sourceCode` at 64,000 and `stdin` at 16,000 characters. A sandbox outage returns 503; a database outage returns 503.

## Reports

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/reports/:sessionId` | Get candidate report. |
| POST | `/reports/:sessionId/generate` | Generate or regenerate report. |
| GET | `/reports/:sessionId/export` | Export report if supported. |

## Analytics

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/analytics/summary` | Dashboard counts and score summary. |
| GET | `/analytics/activity` | Recent activity feed. |

## DTO alignment checklist

When changing a route:

1. Update backend controller/service DTOs.
2. Update frontend API helper/type.
3. Update this document.
4. Add or update the verification step.
