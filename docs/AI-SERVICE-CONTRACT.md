# AI Service Contract

The AI service must be replaceable. Controllers call the internal `AiService` interface, not provider SDKs or raw provider HTTP calls directly.

## Selected MVP provider

- Provider: DeepSeek.
- Model: `deepseek-v4-flash`.
- Base URL: `https://api.deepseek.com/v1`.
- API key env var: `DEEPSEEK_API_KEY`.

Do not commit API keys. Keep provider settings in `.env` / hosting environment variables.

## Current backend adapter

- `src/modules/ai/ai.service.ts` owns the internal service boundary and deterministic fallback behavior.
- `src/modules/ai/deepseek.provider.ts` owns the DeepSeek chat-completions HTTP adapter.
- `src/modules/ai/evaluation.service.ts` remains the safe deterministic rubric/report helper used for fallback and aggregation.
- `getModuleEvaluationProfile(moduleType)` centralizes module-specific rubrics, focus areas, and safety guidance for AI interview, coding, debugging, work-style, behavioral, leadership, communication, and problem-solving modules.

## Required operations

```text
generateInterviewQuestion(template, role, conversationHistory)
generateFollowUp(question, answer, rubric)
evaluateResponse(response, rubric, moduleType)
evaluateCodeSubmission(sourceCode, language, problem, executionResult)
generateCandidateReport(session, evaluations, responses, reviewerNotes)
```

## Required output fields

- score.
- criteria scores.
- written feedback.
- strengths.
- improvement areas.
- evidence from responses.
- advisory notice.

## Failure behavior

If AI provider fails:

- Save the candidate response first.
- Return a clear fallback message.
- Allow retry where possible.
- Do not crash the session.
- Mark evaluation/report as pending if needed.

## Module-specific evaluation profiles

Default rubrics are provided when the frontend/template does not send a custom rubric:

- AI interview: technical clarity, role relevance, problem solving, evidence, reflection.
- Coding/debugging: correctness or root-cause analysis, execution/debugging evidence, readability/method, validation, prevention/complexity.
- Work-style/behavioral: collaboration, ownership, adaptability, self-awareness, learning, professional judgment.
- Leadership: decision-making, conflict resolution, prioritization, accountability, stakeholder communication.
- Communication: clarity, active listening, empathy, professionalism, follow-up.
- Problem-solving: root-cause analysis, trade-off reasoning, structured approach, validation, impact measurement.

Coding assessment UI/execution remains a separate module lane. Member 1 backend AI work only evaluates submitted code text plus sandbox/execution result evidence; it must never run untrusted code inside the API process.

## Safety rules

- No final hiring decision.
- No medical/mental health diagnosis.
- No unsupported claims.
- Use rubrics and response evidence only.
