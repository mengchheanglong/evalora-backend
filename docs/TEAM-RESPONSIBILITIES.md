# Evalora Team Responsibilities

Use this file to keep humans and AI agents aligned. If ownership changes, update this document before assigning agent work.

## Member 1: Long Mengchheang — Core System, AI Evaluation, and Report Logic

Responsible for:

- Database structure.
- Assessment module logic.
- AI evaluation logic.
- Candidate scoring system.
- Candidate report generation.
- Backend API structure for core features.

Primary folders:

- `backend/prisma/`
- `backend/src/modules/ai/`
- `backend/src/modules/reports/`
- `backend/src/modules/templates/`
- `backend/src/modules/sessions/`
- `docs/AI-EVALUATION-RUBRICS.md`

## Member 2: Frontend UX and Candidate Assessment Flow

Responsible for:

- Login and register pages.
- Candidate instruction page.
- Candidate assessment flow.
- Behavioral assessment form.
- Leadership scenario page.
- Assessment submission page.

Primary folders:

- `frontend/src/app/login/`
- `frontend/src/app/assessment/`
- `frontend/docs/UX-FLOW.md`

## Member 3: Frontend UI, Dashboard, and Report Interface

Responsible for:

- Landing page.
- Dashboard layout.
- Navigation components.
- Report interface.
- Analytics cards and charts.
- Responsive UI design.

Primary folders:

- `frontend/src/app/`
- `frontend/src/app/dashboard/`
- `frontend/src/app/reports/`
- `frontend/docs/ROUTES.md`

## Member 4: Coding Assessment, Testing, and Deployment Support

Responsible for:

- Coding assessment page.
- Code editor integration.
- Code execution connection.
- Output display.
- Test cases.
- Deployment support.
- README and demo preparation.

Primary folders:

- `frontend/src/app/assessment/`
- `backend/src/modules/code/`
- `docs/TESTING-DEPLOYMENT.md`

## Collaboration rules

- Open small PRs or commits by feature slice.
- Update docs when changing route/API/model behavior.
- Do not let agents make broad unrelated refactors.
- If two members touch one API, update `docs/API-CONTRACT.md` first.
- Keep the final demo stable: deploy early and test weekly.
