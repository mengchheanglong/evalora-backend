# Evalora Analytics Questions and Metric Review

Status: **Proposed analytics contract — implementation paused for approval**

This review replaces KPI-first design with a question-first contract. It uses the current SRS, Prisma schema, API contract, analytics service, tests, frontend dashboard, and frontend analytics page as evidence. Existing UI formulas are implementation evidence, not metric authority.

## 1. Scope and audience

Evalora needs **one staff analytics model**, not separate workspace and platform analytics products.

- **Admin** manages the platform and users.
- **Interviewer** creates assessments, invites candidates, reviews reports, and uses analytics.
- **Candidate** is invitation-only and has no analytics dashboard.

Admin and Interviewer may have different permissions, but the analytics questions, metric definitions, and page structure remain the same. Authorization changes which records a user can access; it does not create a second metric catalog.

> **Implementation mismatch:** the current backend still contains an `ORGANIZATION` authorization role and organization/platform scope branching. That technical structure must not be treated as proof that the product needs separate analytics experiences. Role-model cleanup should be handled as authentication/authorization work, while this document defines one analytics product.

## 2. Current data boundaries

### Current data

The product currently stores enough data to answer questions about:

- session counts and current status;
- invitations waiting to start and assessments in progress;
- expiry timestamps and completed timestamps;
- completed sessions with or without a persisted report;
- persisted report scores and module evaluation scores;
- template, module type, target role, and organization relationships;
- recent session updates;
- scheduled and active sessions;
- reviewer notes.

### Needs a rule

These questions require a product definition before publication:

- the default analytics period and comparison period;
- cohort-based completion trend versus event-based completion trend;
- when small score samples are safe to compare;
- whether report review requires a dedicated reviewed state or can be inferred from another action;
- whether scores from different templates or roles are comparable;
- the taxonomy used to merge semantically similar AI-generated strengths and improvement areas.

### Data gaps

The current schema does not provide trustworthy facts for:

- AI-provider success/failure/latency rates;
- code-execution provider success/failure/timeout rates;
- immutable session lifecycle events;
- report reviewed/unreviewed workflow state;
- normalized evidence-theme categories;
- dashboard usage or whether analytics changed a reviewer decision.

## 3. Staff analytics questions

Scoring: decision impact 0–3, urgency 0–3, check frequency 0–2, data readiness 0–2. Maximum 10.

| ID | Atomic staff question | Answer form | Feasibility | Score | Decision |
| --- | --- | --- | --- | ---: | --- |
| EQ-01 | How many assessment sessions are currently in progress? | Number | Current data | 10 | Overview |
| EQ-02 | How many assessment invitations are still waiting to start? | Number | Current data | 8 | Overview support |
| EQ-03 | Which active assessment reaches its expiry or scheduled time next? | Prioritized list | Current data | 10 | Overview |
| EQ-04 | How many completed sessions do not have a persisted report? | Number | Current data | 10 | Overview |
| EQ-05 | Which completed reports became ready most recently? | Recent list | Current data | 9 | Overview |
| EQ-06 | What share of closed sessions completed instead of expiring? | Percentage | Current data | 6 | Analytics |
| EQ-07 | Is closed-session completion changing over time? | Trend/comparison | Needs rule | 5 | Analytics after period/cohort approval |
| EQ-08 | How are report scores distributed for a selected comparable assessment group? | Distribution | Current data | 6 | Analytics |
| EQ-09 | Which module types have weaker persisted evaluation scores within a comparable assessment group? | Ranked comparison | Current data | 6 | Analytics diagnostic |
| EQ-10 | How long do completed candidates take to finish a selected assessment? | Distribution/median | Current data | 6 | Analytics |
| EQ-11 | Which templates are assigned most often? | Ranked list | Current data | 4 | Analytics support |
| EQ-12 | Which evidence-backed strengths recur across reports? | Theme list | Needs rule | 3 | Defer |
| EQ-13 | Which candidates have the highest recent scores? | Ranked list | Current data | 3 | Candidate review, not Overview |
| EQ-14 | How many candidates have ever received a session? | Number | Current data | 3 | Inventory context only |

## 4. Selected Overview contract

The Overview should answer daily staff workflow questions, not summarize every analytical fact.

### OV-01 — Assessments in progress

- **Question:** How many assessment sessions are currently in progress?
- **Definition:** count of authorized sessions where `status = IN_PROGRESS` after expiry reconciliation.
- **Time basis:** current snapshot at `asOf`.
- **Action:** open the active-session list and check progress or expiry.
- **Display:** primary operational count.

### OV-02 — Invitations awaiting start

- **Question:** How many assessment invitations are still waiting to start?
- **Definition:** count of authorized sessions where `status = NOT_STARTED` after expiry reconciliation.
- **Time basis:** current snapshot at `asOf`.
- **Action:** follow up, resend, or inspect the invitation.
- **Display:** supporting operational count; not a completion-rate denominator by itself.

### OV-03 — Reports pending

- **Question:** How many completed sessions do not have a persisted report?
- **Definition:** count of authorized sessions where `status = COMPLETED` and no `CandidateReport` exists.
- **Time basis:** current snapshot at `asOf`.
- **Action:** generate or investigate the missing report.
- **Display:** primary action count linked to the filtered candidate/session list.

### OV-04 — Next active assessments

- **Question:** Which active assessment reaches its expiry or scheduled time next?
- **Definition:** authorized `NOT_STARTED` and `IN_PROGRESS` sessions; scheduled sessions ordered by `scheduledAt`, otherwise by `expiresAt`, with unscheduled sessions shown separately rather than assigned a fake date.
- **Action:** prepare for the next assessment or intervene before expiry.
- **Display:** prioritized list, not a KPI card.

### OV-05 — Newly ready reports

- **Question:** Which completed reports became ready most recently?
- **Definition:** persisted reports joined to completed organization sessions, ordered by report creation/update time descending.
- **Action:** open the report and conduct human review.
- **Display:** recent list. Do not sort this list by score.

### OV-06 — Recent session updates

- **Question:** Which session records changed most recently?
- **Definition:** current-state session update feed ordered by `InterviewSession.updatedAt`.
- **Guardrail:** this is not an immutable event log and must not be labeled an activity history.
- **Display:** compact operational feed.

## 5. Selected Analytics contract

The Analytics page should explain workflow outcomes and assessment evidence. It should not duplicate the daily Overview.

### AN-01 — Closed-session completion rate

- **Question:** What share of closed sessions completed instead of expiring?
- **Formula:** `COMPLETED / (COMPLETED + EXPIRED)`.
- **Population:** authorized sessions after expiry reconciliation.
- **Exclusions:** `NOT_STARTED` and `IN_PROGRESS` remain open and are excluded.
- **Label:** `Closed-session completion rate`.
- **Current availability:** all-time snapshot is supported.
- **Trend status:** blocked until the team chooses cohort-based or event-based period logic.

### AN-02 — Report coverage

- **Question:** What share of completed sessions have a persisted report?
- **Formula:** completed sessions with `CandidateReport / all COMPLETED sessions`.
- **Time basis:** current snapshot at `asOf`.
- **Action:** investigate uncovered completed sessions.
- **Label:** `Report coverage`.

### AN-03 — Score distribution for a comparable group

- **Question:** How are report scores distributed for a selected comparable assessment group?
- **Population:** persisted reports for completed sessions, filtered by one template or an explicitly approved comparable target-role group.
- **Date:** session `completedAt` when a period is selected.
- **Display:** distribution plus report count; do not lead with a cross-template platform-wide average.
- **Zero-score rule:** score `0` means no assessable evidence in current report logic and must be separated as `No assessable evidence`, not shown as ordinary `Very weak` performance.

### AN-04 — Module evaluation comparison

- **Question:** Which module types have weaker persisted evaluation scores within a comparable assessment group?
- **Population:** evaluations attached to completed sessions, filtered by selected template or approved comparable target role.
- **Calculation:** equal-weight mean per persisted module evaluation, with evaluation count displayed.
- **Guardrail:** do not rank mixed templates as if different rubrics and candidate mixes were directly comparable.
- **Display:** diagnostic bars/list with score and `n`.

### AN-05 — Completion duration

- **Question:** How long do completed candidates take to finish a selected assessment?
- **Definition:** `completedAt - startedAt` for completed sessions with both timestamps and a non-negative duration.
- **Display:** median and distribution, not only a mean.
- **Guardrail:** segment by template because time limits and module sets differ.

### AN-06 — Template usage

- **Question:** Which templates are assigned most often?
- **Definition:** session count grouped by template within the selected period or all-time snapshot.
- **Display:** supporting ranked list with assignment count and completed count.

## 6. Metrics to remove, relabel, or defer

| Current item | Decision | Reason |
| --- | --- | --- |
| `Candidates` all-time card | Demote | Inventory context; does not identify work or outcome. |
| `Assessments` all-time card | Demote | Volume without period/comparison is not a performance metric. |
| `Completion coverage = completed / all sessions` | Replace | Active sessions in the denominator make the label hard to interpret. Use status counts on Overview and closed-session completion on Analytics. |
| `Average score` across all reports | Remove from Overview | Different templates, roles, rubrics, and candidate mixes are not directly comparable. |
| `Recent score trend` across mixed reports | Defer/rebuild | Candidate/template mix can create a false trend; period and comparable population need approval. |
| `Highest recent scores` | Move to candidate review | A leaderboard does not answer a workspace health question and can overstate AI ranking authority. |
| `Module performance` across all templates | Restrict | Keep only with a comparable template/role filter and visible evaluation count. |
| Raw AI strength/improvement phrase counts | Defer | Whitespace/case normalization does not create a stable semantic taxonomy. |
| `Recent activity` | Relabel | Current source is latest session state/update, not immutable events. |
| Candidate names/emails in analytics summary payloads | Remove | Candidate identity belongs in candidate/session/report views, not aggregate analytics payloads. |

## 7. Access boundaries

- Admin and Interviewer use the same Overview and Analytics structure.
- Authorization determines which sessions, candidates, reports, and aggregates each authenticated user may access.
- Candidate accounts/invitation sessions never receive staff analytics access.
- Candidate identity remains in candidate/session/report routes, not aggregate analytics payloads.
- AI and code reliability remain `Not instrumented` until provider telemetry exists.

## 8. Decisions required before trend implementation

The team must approve these definitions before a period trend is built:

1. **Default period:** for example, selected explicit date range; no default is adopted in this review.
2. **Completion trend:** cohort-based (sessions created in the period, later observed outcome) or event-based (completion/expiry events occurring in the period).
3. **Comparable score group:** exact template only, target role, or another approved grouping.
4. **Small-sample behavior:** minimum display rule or explicit low-sample warning.
5. **Report review state:** add a dedicated reviewed timestamp/status if the product needs a true review queue.
6. **Theme taxonomy:** controlled rubric categories or a governed normalization method before theme frequency is published.

## 9. Recommended implementation order after approval

1. Keep expiry reconciliation, role scoping, status counts, reports-pending facts, and current-state update feed.
2. Refocus the shared Admin/Interviewer Overview on OV-01 through OV-06.
3. Remove cross-template average score and score leaderboard from Overview.
4. Keep all-time AN-01 and AN-02 as clearly labeled snapshots.
5. Add template/role filters before publishing AN-03 through AN-06.
6. Separate score zero as `No assessable evidence`.
7. Keep Admin and Interviewer on the same metric catalog and page structure; enforce record access through authorization.
8. Add telemetry before claiming AI or code reliability.
9. Add period trends only after the decisions in section 8 are approved.

## 10. Evidence trace

Primary evidence inspected:

- `docs/SRS.md` — product purpose, roles, analytics requirements, AI advisory boundary.
- `docs/API-CONTRACT.md` — current analytics endpoints and all-time contract.
- `docs/API-MODULES.md` — current analytics behavior and persistence sources.
- `prisma/schema.prisma` — session, report, evaluation, template, organization, and timestamp support.
- `src/modules/analytics/analytics.service.ts` — current formulas, filters, grouping, sampling, and expiry reconciliation.
- `test/analytics.service.test.ts` — current expected behavior.
- frontend `docs/ROUTES.md` — route purpose and API dependencies.
- frontend `docs/AI-EVALUATION-RUBRICS.md` — evidence and advisory constraints.
- frontend `src/app/dashboard/page.tsx` and `src/app/analytics/page.tsx` — current display and decision hierarchy.
- frontend `src/lib/types.ts` — live API consumer contract.

## 11. Current verdict

**PASS WITH LIMITATIONS:** the database supports one useful MVP staff Overview and one bounded Analytics page for Admin and Interviewer, but the current implementation mixes workflow, inventory, candidate ranking, and cross-template score comparison. The safest next build is a shared operational Overview plus comparable-group analytics, with authorization controlling record visibility. Period trends, review workflow analytics, theme frequency, and provider reliability require additional decisions or instrumentation.
