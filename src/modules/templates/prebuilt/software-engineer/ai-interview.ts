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
        "technical-reasoning",
        "ownership",
        "incident-process",
        "learning",
        "communication"
      ]
    },
    {
      "id": "prebuilt-se-ai-tradeoffs",
      "questionText": "Describe a technical trade-off you made between speed, reliability, maintainability, or cost. How did you choose?",
      "questionType": "short_answer",
      "rubric": [
        "trade-off-reasoning",
        "constraints",
        "impact-awareness",
        "clarity"
      ]
    },
    {
      "id": "prebuilt-se-ai-unfamiliar-codebase",
      "questionText": "How do you approach making a safe change in a codebase you do not know yet?",
      "questionType": "scenario",
      "rubric": [
        "codebase-navigation",
        "risk-reduction",
        "testing",
        "communication"
      ]
    },
    {
      "id": "prebuilt-se-ai-technical-debt",
      "questionText": "A shortcut would help ship this week but adds technical debt. How do you decide whether to accept it?",
      "questionType": "scenario",
      "rubric": [
        "business-context",
        "risk-assessment",
        "debt-framing",
        "stakeholder-alignment"
      ]
    },
    {
      "id": "prebuilt-se-ai-observability",
      "questionText": "What signals would you want before saying a new backend feature is production-ready?",
      "questionType": "short_answer",
      "rubric": [
        "observability",
        "testing",
        "rollback-readiness",
        "performance-awareness"
      ]
    },
    {
      "id": "prebuilt-se-ai-generated-code",
      "questionText": "AI generated a solution that passes sample tests. What else would you check before merging it?",
      "questionType": "scenario",
      "rubric": [
        "ai-limitation-awareness",
        "test-depth",
        "security-review",
        "maintainability",
        "ownership"
      ]
    }
  ]
};
