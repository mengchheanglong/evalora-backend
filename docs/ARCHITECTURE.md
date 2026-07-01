# Evalora Architecture

## High-level architecture

```text
User Browser
  |
  v
Next.js Frontend
  |
  v
NestJS Backend API (/api)
  |---------------------> AI API Provider
  |---------------------> Code Execution Sandbox / Judge0
  |---------------------> Socket.IO / WebSocket Gateway
  v
PostgreSQL Database
```

## Layer responsibilities

| Layer | Responsibility |
| --- | --- |
| Frontend | UI, route navigation, candidate assessment flow, dashboard, reports, API calls. |
| Backend API | Auth, RBAC, validation, templates, sessions, responses, evaluation orchestration, reports, analytics. |
| Database | Persistent data for users, templates, modules, sessions, responses, AI messages, submissions, evaluations, reports, notes. |
| AI service | Question generation, follow-up generation, response evaluation, code review, report summary. |
| Code execution service | Runs submitted candidate code safely and returns stdout/stderr/test result. |
| WebSocket service | Optional real-time AI chat/session update channel. |

## First implementation boundary

The scaffold contains demo endpoints and UI placeholders so the team can align contracts before adding persistence and external services.

Recommended vertical-slice order:

1. Auth + role-aware layout.
2. Template CRUD with Prisma persistence.
3. Session creation + candidate access code.
4. Candidate response saving.
5. AI interview MVP.
6. Coding run/submit through sandbox.
7. Evaluation + report generation.
8. Dashboard analytics.

## Data flow: candidate assessment

```text
Candidate opens session link
  -> frontend loads session details
  -> backend validates session status/access
  -> candidate completes modules
  -> frontend submits responses/code/messages
  -> backend stores progress
  -> backend calls AI/sandbox where needed
  -> backend generates evaluations
  -> backend generates report
  -> interviewer reviews report and adds notes
```

## Data flow: interviewer template/session

```text
Interviewer logs in
  -> creates assessment template
  -> adds ordered modules and questions
  -> creates session for candidate
  -> sends access link/code
  -> tracks status on dashboard
  -> reviews generated report
```

## Deployment shape

- Frontend: Vercel or similar static/server-rendered Next host.
- Backend: Render, Railway, Fly.io, AWS, or similar Node host.
- Database: managed PostgreSQL.
- Environment variables stay per-service.
