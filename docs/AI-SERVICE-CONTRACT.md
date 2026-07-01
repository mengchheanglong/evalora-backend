# AI Service Contract

The AI service must be replaceable. Controllers should call an internal service interface, not provider SDKs directly.

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
