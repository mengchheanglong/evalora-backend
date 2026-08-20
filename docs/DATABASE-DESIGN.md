# Evalora Database Design

Evalora uses PostgreSQL on Neon with Prisma.

## Main entities

| Entity | Purpose |
| --- | --- |
| User | Platform account or invite-only candidate record, email, password hash, role, optional organization. Workspace roles: `organization` (owner) and `interviewer` (invited teammate). |
| Organization | Company/client workspace. Multiple users share one organization. |
| OrganizationInvite | Pending/accepted/cancelled teammate invites (email, token, expiry, invitedBy). |
| AssessmentTemplate | Reusable assessment structure for a role/job. |
| AssessmentTemplateDraft | AI-proposed assessment awaiting human confirmation. Holds the uploaded source text, the original AI proposal, and the reviewer's edited draft. Never assigned to a candidate. |
| AssessmentModule | Ordered module inside a template. |
| Question | Prompt/question/rubric inside a module. |
| InterviewSession | One assigned candidate assessment attempt, including optional workspace metadata (title, interviewers, schedule, notes, department, language). |
| Response | Candidate answer to a question/module. |
| AIMessage | AI/candidate chat messages. |
| CodeSubmission | Candidate code, run output, language, status. |
| Evaluation | Module-level score, feedback, evidence. |
| CandidateReport | Final structured report for one session. |
| ReviewerNote | Human reviewer comments on a session/report. |

## Relationship summary

```text
Organization 1---N User
Organization 1---N OrganizationInvite
Organization 1---N AssessmentTemplate
Organization 1---N AssessmentTemplateDraft
User(creator) 1---N AssessmentTemplateDraft
AssessmentTemplate 1---N AssessmentModule
AssessmentModule 1---N Question
AssessmentTemplate 1---N InterviewSession
User(candidate) 1---N InterviewSession
User(creator) 1---N InterviewSession
InterviewSession 1---N Response
InterviewSession 1---N AIMessage
InterviewSession 1---N CodeSubmission
InterviewSession 1---N Evaluation
InterviewSession 1---1 CandidateReport
InterviewSession 1---N ReviewerNote
```

## Important modeling rules

- Passwords are stored only as `passwordHash`.
- Public login is for admin/interviewer platform accounts. Candidate `User` rows are invite-only participant records created from session candidate info and use random password hashes that are not used for login.
- Candidate assessment access is controlled by `InterviewSession.accessCode`; access ends after completion/expiry while authorized admins/interviewers retain session data, responses, evaluations, and reports.
- Workspace create-session metadata is optional: `title`, `interviewType`, `interviewers` (JSON string array), `notes`, `targetRole`, `department`, `scheduledAt`, `durationMin`, `language`, `timeZone`, and `createdById`.
- Use enums for roles, session status, module type, and question type.
- Store AI evidence as JSON so reports can quote response-backed justification.
- `AssessmentTemplateDraft` is the confirmation gate for AI-assisted template generation. Generation writes only a draft row; a draft becomes an `AssessmentTemplate` solely through the confirm endpoint, which stamps `status = PUBLISHED` and `publishedTemplateId`. `publishedTemplateId` is a plain id rather than a relation so deleting a template is never blocked by the draft that produced it.
- A draft stores `aiProposal` (as generated) and `draft` (as edited) separately, so a reviewer can compare what the AI suggested against what was published, and confirmation always reads the edited version.
- `AssessmentTemplateDraft.sourceText` holds text extracted from an uploaded job description. It is untrusted user content and is deleted along with templates and sessions when an owner wipes workspace data.
- Draft module weights are stored as integer percentages totalling 100. Existing templates and prebuilt blueprints keep relative weights; report scoring normalizes by total weight either way.
- Store code execution results separately from final report for auditability.
- Reports are private and should only be queryable by authorized users.
- Dashboard queries use organization/status/completion/update indexes on sessions, an organization index on templates, and a session/time index on evaluations. These indexes keep scoped overview queries efficient without weakening RBAC filters.

See `backend/prisma/schema.prisma` for the first Prisma schema draft.
