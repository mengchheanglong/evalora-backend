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
- `src/modules/reports/reports.service.ts` uses `AiService.evaluateResponse()` to evaluate saved candidate responses grouped by assessment module before persisting module-level evaluations and the final candidate report.

## Required operations

```text
generateInterviewQuestion(template, role, conversationHistory)
generateFollowUp(question, answer, rubric)
generateTemplateDraft(sourceText, idea, roleType)
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

## AI-assisted template generation

`generateTemplateDraft` proposes an assessment from a job description or a written idea. It is the only AI operation whose input comes from a user-uploaded file, so it carries extra boundaries:

- **The AI never publishes.** The proposal is stored as an `AssessmentTemplateDraft`. Only an authenticated workspace user calling the confirm endpoint creates an `AssessmentTemplate`.
- **The AI never sets weights.** It rates each module 1-5 on role importance, risk if the skill is weak, evidence collected, difficulty, and whether the skill is essential, and explains each rating. `src/modules/templates/drafts/weighting.ts` converts those ratings into integer percentages totalling exactly 100, applying configurable minimums. The output contract does not contain a weight field at all, so there is nothing for a document to steer.
- **Uploaded material is data, never instruction.** The system prompt states that `sourceDocument` and `idea` are untrusted user-supplied text to be described, not obeyed — the same rule `QUESTION_CONTEXT_INSTRUCTION` applies to question wording during evaluation.
- **Prompt hardening is not the guarantee.** Everything the model returns passes through `src/modules/templates/drafts/draft-normalizer.ts`, which drops unsupported module and question types, caps counts and lengths, strips control and zero-width characters, and recomputes weights. The same normalizer runs on reviewer edits, so hand-edited and generated drafts obey identical rules.
- **Fallback yields a usable draft, not an error.** When the provider is unconfigured, fails, or returns nothing usable, `AiService` reports `provider: "fallback"` and the drafts service starts from the closest prebuilt blueprint. The confirmation requirement is unchanged on that path.

## Safety rules

- No final hiring decision.
- No medical/mental health diagnosis.
- No unsupported claims.
- Use rubrics and response evidence only.
