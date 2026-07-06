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

`POST /api/auth/register` request:

```json
{
  "name": "Demo User",
  "email": "demo@example.com",
  "password": "minimum-8-characters",
  "role": "candidate"
}
```

`POST /api/auth/login` request:

```json
{
  "email": "demo@example.com",
  "password": "minimum-8-characters"
}
```

Both successful routes return a signed JWT and safe user object. The response must never include `passwordHash`.

Protected routes, including `GET /api/auth/me`, require:

```http
Authorization: Bearer JWT_TOKEN
```

JWT payloads carry `sub`, `email`, and `role`. Role-restricted routes should use the same role values as the SRS: `candidate`, `interviewer`, `organization`, or `admin`.

## Assessment templates

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/templates` | List templates visible to current organization/admin. |
| POST | `/templates` | Create template. |
| GET | `/templates/:id` | Get template details including modules/questions. |
| PUT | `/templates/:id` | Update template. |
| DELETE | `/templates/:id` | Delete template. |

Template routes require a Bearer JWT. `GET` routes allow `admin`, `organization`, and `interviewer`; write routes allow `admin` and `organization`.

`POST /api/templates` request:

```json
{
  "title": "Backend Engineer Assessment",
  "description": "Technical backend screen",
  "roleType": "Backend Engineer",
  "timeLimitMin": 60,
  "scoringRules": { "passScore": 3.5 },
  "organizationId": "org-id-if-applicable",
  "modules": [
    {
      "type": "ai_interview",
      "title": "AI Interview",
      "description": "Scenario questions",
      "weight": 1.25,
      "orderIndex": 1,
      "questions": [
        {
          "questionText": "Tell us about a production incident.",
          "questionType": "scenario",
          "rubric": ["clarity", "ownership"]
        }
      ]
    }
  ]
}
```

The backend uses the authenticated JWT user as `createdById`; clients must not send password or secret fields in template payloads.

## Interview sessions

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/sessions` | Create candidate session from template. |
| GET | `/sessions` | List sessions visible to current user. |
| GET | `/sessions/:id` | Get session details. |
| PUT | `/sessions/:id/start` | Mark session in progress. |
| PUT | `/sessions/:id/complete` | Complete session and trigger evaluation/report workflow. |

Session routes require a Bearer JWT. Create/list routes allow `admin`, `organization`, and `interviewer`. Detail/start/complete routes additionally allow `candidate` for assigned candidate flows; ownership filtering still belongs in the next hardening slice.

`POST /api/sessions` request:

```json
{
  "candidateId": "candidate-user-id",
  "templateId": "assessment-template-id",
  "organizationId": "org-id-if-applicable",
  "expiresAt": "2026-08-01T00:00:00.000Z"
}
```

The backend generates a unique-style access code and starts sessions as `not_started`. Session responses include candidate/template labels when Prisma relation data is available.

## Responses

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/responses` | Submit or autosave candidate response. |
| GET | `/responses/session/:sessionId` | Get responses for one session. |

Response routes require a Bearer JWT. `POST /api/responses` accepts candidate autosaves and reviewer/admin corrections; ownership filtering still belongs in the next hardening slice.

`POST /api/responses` request:

```json
{
  "sessionId": "interview-session-id",
  "questionId": "question-id-if-applicable",
  "responseText": "Candidate answer text",
  "responseJson": { "confidence": 4 }
}
```

If `sessionId` + `questionId` already has a saved response, the backend updates that row for autosave. Otherwise it creates a new response. The response includes `savedAt` from the persisted row timestamp.

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
| POST | `/code/run` | Run candidate code in sandbox. |
| POST | `/code/submit` | Save final candidate code. |
| GET | `/code/submissions/:sessionId` | List code submissions for one session. |

## Reports

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/reports/:sessionId` | Get candidate report. |
| POST | `/reports/:sessionId/generate` | Generate or regenerate report. |
| GET | `/reports/:sessionId/export` | Export report if supported. |

`POST /api/reports/:sessionId/generate` returns generated report fields plus:

```json
{
  "generatedAt": "2026-07-01T00:00:00.000Z",
  "persistence": {
    "status": "persisted"
  }
}
```

Persistence status may be `persisted`, `skipped`, or `failed`. A failed persistence status means report generation completed, but the database write did not complete.

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
