# Evalora Database Design

Evalora uses PostgreSQL on Neon with Prisma.

## Main entities

| Entity | Purpose |
| --- | --- |
| User | Platform account or invite-only candidate record, email, password hash, role, optional organization. |
| Organization | Company/client workspace. |
| AssessmentTemplate | Reusable assessment structure for a role/job. |
| AssessmentModule | Ordered module inside a template. |
| Question | Prompt/question/rubric inside a module. |
| InterviewSession | One assigned candidate assessment attempt. |
| Response | Candidate answer to a question/module. |
| AIMessage | AI/candidate chat messages. |
| CodeSubmission | Candidate code, run output, language, status. |
| Evaluation | Module-level score, feedback, evidence. |
| CandidateReport | Final structured report for one session. |
| ReviewerNote | Human reviewer comments on a session/report. |

## Relationship summary

```text
Organization 1---N User
Organization 1---N AssessmentTemplate
AssessmentTemplate 1---N AssessmentModule
AssessmentModule 1---N Question
AssessmentTemplate 1---N InterviewSession
User(candidate) 1---N InterviewSession
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
- Use enums for roles, session status, module type, and question type.
- Store AI evidence as JSON so reports can quote response-backed justification.
- Store code execution results separately from final report for auditability.
- Reports are private and should only be queryable by authorized users.

See `backend/prisma/schema.prisma` for the first Prisma schema draft.
