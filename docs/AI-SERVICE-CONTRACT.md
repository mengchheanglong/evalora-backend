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

## Safety rules

- No final hiring decision.
- No medical/mental health diagnosis.
- No unsupported claims.
- Use rubrics and response evidence only.
