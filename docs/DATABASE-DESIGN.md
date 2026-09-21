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
| IntegrityEvent | One browser-detected integrity signal (tab switch, blur, page hide, exit attempt) with server-authored `counted` and `reason`; unique per `(sessionId, clientEventId)`. |

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
InterviewSession 1---N IntegrityEvent
```

## Important modeling rules

- Passwords are stored only as `passwordHash`.
- Public login is for admin/interviewer platform accounts. Candidate `User` rows are invite-only participant records created from session candidate info and use random password hashes that are not used for login.
- Candidate assessment access is controlled by `InterviewSession.accessCode`; access ends after completion/expiry while authorized admins/interviewers retain session data, responses, evaluations, and reports. `completedAt` and `expiredAt` record the actual terminal lifecycle time, independently of later record updates.
- Workspace create-session metadata is optional: `title`, `interviewType`, `interviewers` (JSON string array), `notes`, `targetRole`, `department`, `scheduledAt`, `durationMin`, `language`, `timeZone`, and `createdById`.
- `InterviewSession.warningCount` and `warningLimit` (default 2) are the official integrity counters. Two-strike policy: the first counted event increments `warningCount` to 1 and keeps the session active; the second counted event reaches the limit and the backend expires the session. Only the backend increments/reads them; the browser reports signals and receives the decision back.
- `IntegrityEvent` rows are immutable audit records. `(sessionId, clientEventId)` is unique so retries can never double-count; `counted` is decided server-side from the event type (`visibilitychange` counts; `blur`/`pagehide`/`beforeunload` are supporting evidence only).
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

## Organization subscription (Step 1)

`Organization.subscription` is optional and one-to-one with `Subscription` (`subscriptions`). The unique `organization_id` foreign key scopes the record to a workspace, not an individual. Organization deletion cascades to its subscription. This stores one current record, not a subscription event history.

Fields: UUID `id`; `organizationId`; required `plan` (PLUS/PRO/BUSINESS), `status` (ACTIVE/TRIALING/PAST_DUE/CANCELLED/EXPIRED), `billingCycle` (MONTHLY/ANNUAL); required DateTime `currentPeriodStart` and `currentPeriodEnd`; `cancelAtPeriodEnd` (default false); nullable `providerCustomerId` and unique nullable `providerSubscriptionId`; `createdAt` and automatically maintained `updatedAt`.

Plan, status, cycle, and period dates have no defaults: absent data cannot silently provision a paid plan. Provider fields are reserved for a future single-provider integration. No records are seeded or backfilled. Migration: `prisma/migrations/20260913000000_add_organization_subscription/migration.sql`.

## Prepaid payment attempts (Step 4)

`Subscription` also carries `renewalMode` (`MANUAL | AUTOMATIC`, default `MANUAL`) and the paired `pendingPlan` / `pendingBillingCycle` columns that hold a plan change which has been paid for but starts at the end of the running period. They are always written and cleared together.

`PaymentAttempt` (`payment_attempts`) records one attempt to buy one prepaid billing cycle: UUID `id`; `organizationId` (cascade on organization delete); nullable `subscriptionId` (`onDelete: SetNull`, because a subscription row can be replaced by a new paid period without losing payment history); unique `tranId` (the merchant transaction id sent to PayWay and the only identity a callback is resolved with, max 20 characters); unique `idempotencyKey`; `plan`; `billingCycle`; `purpose` (`NEW_SUBSCRIPTION | RENEWAL | PLAN_CHANGE`); `amountMinor` (integer cents, backend catalog); `currency`; `status` (`PENDING | VERIFIED | FAILED`); nullable `providerReference`, `providerStatus`, `failureReason`; nullable `verifiedAt`, `periodStart`, `periodEnd`; `createdAt`; `updatedAt`.

Idempotency is enforced twice. The unique `idempotency_key` stops two concurrent identical checkouts from creating two chargeable transactions. The `PENDING → VERIFIED` conditional update is the activation claim inside one database transaction, so a duplicate callback, a repeated poll, or two simultaneous reconcilers extend a paid period exactly once. There is no `PaymentCredential` table and no billing worker state: no card or account data is stored anywhere, and every renewal is a new customer-initiated payment.

As with the subscription record, Prisma validation and client generation do not apply these changes; migration: `prisma/migrations/20260913010000_add_manual_payment_attempts/migration.sql`.
