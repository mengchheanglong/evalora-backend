import type { PrebuiltModuleDefinition } from "../types";

export const softwareAiInterviewModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-se-ai-interview",
  "type": "ai_interview",
  "title": "Technical AI Interview",
  "description": "Assesses engineering reasoning, ownership, trade-offs, production awareness, and AI-era judgment.",
  "weight": 1.1,
  "orderIndex": 1,
  "settings": {
    "recommendedMinutes": 15,
    "allowFollowUps": true
  },
  "questions": [
    {
      "id": "prebuilt-se-ai-production-incident",
      "questionText": "Tell us about a production incident or difficult technical bug you handled. What did you do and what changed afterward?",
      "questionType": "scenario",
      "rubric": [
        "explain the root cause, not the symptom",
        "say what they personally did to fix it",
        "describe how it was detected and contained",
        "name the prevention change made afterward",
        "describe how the team and users were updated"
      ]
    },
    {
      "id": "prebuilt-se-ai-tradeoffs",
      "questionText": "Describe a technical trade-off you made between speed, reliability, maintainability, or cost. How did you choose?",
      "questionType": "short_answer",
      "rubric": [
        "name the options that were compared",
        "state the constraint that forced the choice",
        "explain what the rejected option would have cost",
        "describe who the decision affected"
      ]
    },
    {
      "id": "prebuilt-se-ai-unfamiliar-codebase",
      "questionText": "How do you approach making a safe change in a codebase you do not know yet?",
      "questionType": "scenario",
      "rubric": [
        "describe how they read the code before changing it",
        "keep the change small and reversible",
        "name the tests run before and after",
        "say who reviews the change"
      ]
    },
    {
      "id": "prebuilt-se-ai-technical-debt",
      "questionText": "A shortcut would help ship this week but adds technical debt. How do you decide whether to accept it?",
      "questionType": "scenario",
      "rubric": [
        "weigh the business deadline against the risk",
        "name what could break if the shortcut ships",
        "describe how the debt is recorded and repaid",
        "say who agrees to the shortcut"
      ]
    },
    {
      "id": "prebuilt-se-ai-observability",
      "questionText": "What signals would you want before saying a new backend feature is production-ready?",
      "questionType": "short_answer",
      "rubric": [
        "name the metrics, logs, or alerts to watch",
        "describe the tests that must pass first",
        "explain how the release can be rolled back",
        "state the expected load or latency"
      ]
    },
    {
      "id": "prebuilt-se-ai-generated-code",
      "questionText": "AI generated a solution that passes sample tests. What else would you check before merging it?",
      "questionType": "scenario",
      "rubric": [
        "name what generated code often gets wrong",
        "describe edge cases the sample tests miss",
        "check inputs, secrets, and permissions",
        "judge whether the code stays readable later",
        "take responsibility for what they merge"
      ]
    }
  ]
};
