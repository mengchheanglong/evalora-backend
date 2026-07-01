# Backend API Modules

## Auth

Endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Implementation tasks:

- Hash passwords with bcrypt.
- Sign JWT with role claims.
- Add guards for authenticated routes.
- Add role guard for admin/organization/interviewer/candidate boundaries.

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

## Code execution

Use a sandbox/Judge0-style service. Never run submitted code directly in Node.
