import type { PrebuiltModuleDefinition } from "../types";

export const softwareCommunicationModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-se-communication",
  "type": "communication",
  "title": "Engineering Communication",
  "description": "Checks ability to explain risk, review code constructively, write incident updates, and collaborate with non-technical stakeholders.",
  "weight": 1.0,
  "orderIndex": 5,
  "settings": {
    "recommendedMinutes": 12
  },
  "questions": [
    {
      "id": "prebuilt-se-communication-risk-update",
      "questionText": "Explain a technical delay to a product manager in a way that is honest, concise, and includes recovery options.",
      "questionType": "roleplay",
      "rubric": [
        "clarity",
        "stakeholder-empathy",
        "risk-framing",
        "solution-orientation"
      ]
    },
    {
      "id": "prebuilt-se-communication-pr-review",
      "questionText": "Write a pull request review comment for code that works but is hard to maintain. Be direct and respectful.",
      "questionType": "short_answer",
      "rubric": [
        "specificity",
        "respect",
        "maintainability",
        "actionability"
      ]
    },
    {
      "id": "prebuilt-se-communication-incident",
      "questionText": "Write a short incident update for non-technical stakeholders after a partial outage.",
      "questionType": "short_answer",
      "rubric": [
        "plain-language",
        "impact-framing",
        "next-steps",
        "accountability"
      ]
    },
    {
      "id": "prebuilt-se-communication-disagreement",
      "questionText": "You disagree with a senior engineer's design. How do you raise your concern productively?",
      "questionType": "roleplay",
      "rubric": [
        "evidence",
        "respect",
        "trade-off-framing",
        "collaboration"
      ]
    },
    {
      "id": "prebuilt-se-communication-handoff",
      "questionText": "What information should be included when handing off an unfinished technical task to another engineer?",
      "questionType": "short_answer",
      "rubric": [
        "context",
        "current-state",
        "known-risks",
        "next-steps",
        "test-status"
      ]
    }
  ]
};
