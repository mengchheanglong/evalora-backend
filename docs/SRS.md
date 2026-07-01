# Evalora Software Requirements Specification

## 1. Introduction

### 1.1 Purpose

Evalora is an AI-powered candidate assessment platform designed to help organizations evaluate candidates through technical interviews, coding assessments, behavioral questions, leadership scenarios, communication tasks, and automated candidate reports.

This SRS is the shared source of truth for the frontend, backend, database, AI evaluation, and reporting work.

### 1.2 Scope

Evalora allows organizations to:

- Create reusable assessment templates.
- Assign templates to candidates.
- Run AI-supported interview sessions.
- Provide coding tests for technical candidates.
- Provide behavioral/work-style, leadership, communication, and problem-solving tasks.
- Generate structured candidate reports.
- View candidate performance through dashboards and analytics.

The platform supports both technical and non-technical assessments for different candidate roles.

### 1.3 Definitions

| Term | Meaning |
| --- | --- |
| AI | Artificial Intelligence |
| API | Application Programming Interface |
| JWT | JSON Web Token |
| SRS | Software Requirements Specification |
| ER Diagram | Entity Relationship Diagram |
| RBAC | Role-Based Access Control |
| Module | One assessment section such as AI interview, coding, leadership, or work-style |
| Session | One candidate's assigned assessment attempt |
| Report | Structured output with scores, evidence, feedback, strengths, weaknesses, and reviewer notes |

### 1.4 Tools and technologies

- Frontend: Next.js with TypeScript.
- Backend: NestJS with TypeScript.
- Database: PostgreSQL.
- ORM: Prisma.
- Authentication: JWT-based authentication.
- UI styling: Tailwind CSS.
- Real-time communication: Socket.IO/WebSocket boundary.
- Code editor: Monaco Editor.
- Code execution: Judge0 API or secure sandbox service.
- AI integration: external AI API provider via backend abstraction.

## 2. Overall description

### 2.1 System overview

Evalora is a cloud-ready web platform with multiple assessment modules:

- AI interview chat.
- Coding assessment.
- Work-style and behavioral assessment.
- Leadership scenario assessment.
- Communication roleplay.
- Problem-solving case study.
- Candidate report generation.
- Dashboard and analytics.

After a candidate completes an assessment, Evalora generates a report containing scores, feedback, strengths, weaknesses, response evidence, and reviewer notes.

### 2.2 User roles

| Role | Characteristics |
| --- | --- |
| Candidate | Completes assigned assessment sessions and submits responses. |
| Interviewer / Organization User | Creates templates, assigns sessions, reviews reports, and adds notes. |
| Administrator | Manages users, roles, permissions, data, and platform analytics. |

### 2.3 Operating environment

Supported browsers:

- Google Chrome.
- Microsoft Edge.
- Mozilla Firefox.
- Safari.

Supported devices:

- Desktop computers.
- Laptops.
- Tablets.
- Smartphones for non-coding flows.

The coding assessment is primarily designed for desktop and laptop use.

### 2.4 Design constraints

- The platform must be web-based.
- The platform must support RBAC.
- Candidate assessment data must be stored securely.
- AI feedback is support for reviewers, not a final hiring decision.
- Behavioral/work-style output must not be presented as medical or psychological diagnosis.
- The final demo must be publicly accessible.
- The repository should show meaningful commit history from all team members.
- Documentation must be clear enough for both humans and AI agents to continue work.

### 2.5 Assumptions and dependencies

- Users have internet access.
- Candidates can access the platform through a browser.
- AI features depend on an external AI API provider.
- Code execution depends on an external API or sandbox service.
- The system is hosted on a cloud platform for final presentation.

## 3. Functional requirements

### 3.1 Authentication and RBAC

- Users can register with name, email, password, and role.
- Users can log in securely.
- Users can log out.
- Passwords are hashed before storage.
- JWT/session handling protects user sessions.
- Role checks prevent unauthorized page and API access.

### 3.2 Assessment template management

Authorized users can create, edit, duplicate, delete, and assign assessment templates.

Templates may include:

- AI interview questions.
- Coding tasks.
- Debugging tasks.
- Behavioral/work-style questions.
- Leadership scenarios.
- Communication roleplay tasks.
- Problem-solving questions and case studies.

Template data includes title, description, target role, modules, time limit, scoring rules, and creator.

### 3.3 Assessment module system

Supported module types:

| Module | Description |
| --- | --- |
| AI Interview Chat | Candidate answers AI-generated questions and follow-ups. |
| Coding Assessment | Candidate solves programming problems in a browser editor. |
| Debugging Task | Candidate finds and explains code errors. |
| Work-Style / Behavioral | Candidate answers structured questions about collaboration, ownership, adaptability, motivation, and work style. |
| Leadership Scenario | Candidate responds to realistic workplace leadership situations. |
| Communication Roleplay | Candidate chats with an AI acting as a client, teammate, manager, or customer. |
| Problem-Solving Case Study | Candidate proposes a practical solution to a realistic problem. |

Each module stores responses, calculates module scores, and produces module-level feedback.

### 3.4 AI interview chat

The system provides an AI interview chat where candidates answer interview questions and may receive follow-up questions.

Requirements:

- Generate questions based on selected role/template.
- Store full conversation history.
- Support streaming responses if technically possible.
- Handle AI API failure gracefully.
- Generate a summary of the AI interview.

### 3.5 Coding assessment

The coding assessment includes:

- Browser-based code editor.
- Syntax highlighting.
- Coding problem description.
- Run code action.
- Output display.
- Final code submission storage.
- Code execution timeout handling.
- At least JavaScript support for MVP.

The API must not directly execute untrusted code in the backend process. Use Judge0 or a sandbox service.

### 3.6 Behavioral/work-style assessment

The behavioral module may include:

- Multiple-choice questions.
- Rating-scale questions.
- Short-answer questions.
- Work-style questions.
- Problem-solving questions.

The goal is to understand work style, collaboration, responsibility, adaptability, stress response, motivation, and learning style. Results must be presented as supportive insights only.

### 3.7 Leadership and communication assessment

Candidates may receive scenarios such as:

- Handling team conflict.
- Managing deadline pressure.
- Responding to an unhappy client.
- Explaining a problem clearly.
- Making decisions as a team leader.

Evaluation criteria include clarity, empathy, accountability, decision-making, professionalism, conflict handling, and problem-solving.

### 3.8 Interview session management

Interviewers can create and manage sessions with:

- Candidate information.
- Selected assessment template.
- Unique session link or access code.
- Session status: `not_started`, `in_progress`, `completed`, `expired`.
- Start time.
- Completion time.
- Candidate responses.
- Evaluation results.

The system should save progress and support reconnect handling where possible.

### 3.9 AI evaluation and scoring

AI evaluates responses using predefined rubrics.

Output must include:

- Module score.
- Overall score.
- Written feedback.
- Evidence from candidate responses.
- Strengths.
- Improvement areas.
- Advisory disclaimer.

Scoring scale:

| Score | Meaning |
| --- | --- |
| 1 | Very weak |
| 2 | Weak |
| 3 | Acceptable |
| 4 | Good |
| 5 | Excellent |

### 3.10 Candidate report

The report includes:

- Candidate information.
- Assessment name.
- Completion date and duration.
- Overall score.
- Module scores.
- Technical summary.
- Behavioral summary.
- Leadership and communication summary.
- AI feedback summary.
- Strengths.
- Weaknesses/improvement areas.
- Evidence from candidate responses.
- Reviewer notes.

Reports are accessible only to authorized users.

### 3.11 Dashboard and analytics

Dashboard metrics include:

- Total candidates.
- Total assessments/templates.
- Completed assessments.
- Pending assessments.
- Average score.
- Candidate performance.
- Module performance.
- Recent assessment activity.
- Completion rate.
- Common strengths and weaknesses.

## 4. Non-functional requirements

### 4.1 Performance

- Main pages should load within 3 seconds under normal usage.
- Dashboard queries should be optimized.
- AI responses should show streaming/loading states.
- Code execution should use timeout limits.
- The system should support multiple concurrent candidates.

### 4.2 Security

- Hash passwords.
- Protect API endpoints with authentication and RBAC.
- Validate input.
- Protect candidate reports from public access.
- Store secrets only in environment variables.
- Isolate code execution in a sandbox/external service.

### 4.3 Usability

- Simple navigation.
- Clear candidate instructions.
- Clean dashboard design.
- Responsive layout.
- Easy-to-read reports.
- Assessment flow usable without developer guidance.

### 4.4 Reliability

- Candidate responses are saved properly.
- Reports are generated correctly.
- Errors are handled clearly.
- AI API failure does not crash the system.
- Code execution timeout is handled properly.
- Refresh/reconnect should preserve progress where possible.

### 4.5 Maintainability

Use modular structure:

- Authentication.
- Users.
- Assessment Templates.
- Interview Sessions.
- AI Evaluation.
- Code Execution.
- Reports.
- Analytics.

## 5. Acceptance criteria

The MVP is successful if:

1. Users can register and log in.
2. Roles and permissions work correctly.
3. Organizations can create assessment templates.
4. Candidates can complete assigned sessions.
5. At least one AI interview module works.
6. At least one coding assessment works.
7. At least one non-technical assessment works.
8. AI can generate feedback and scores with evidence.
9. The system can generate a candidate report.
10. Dashboard displays assessment and candidate data.
11. The platform is deployed publicly.
12. Documentation includes architecture, database design, API documentation, testing, screenshots, and individual contribution.
