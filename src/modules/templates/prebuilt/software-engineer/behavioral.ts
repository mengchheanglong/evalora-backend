import type { PrebuiltModuleDefinition } from "../types";

export const softwareBehavioralModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-se-behavioral",
  "type": "behavioral",
  "title": "Engineering Behavioral Interview",
  "description": "Explores ownership, collaboration, failure recovery, learning velocity, and cross-functional product impact.",
  "weight": 1.05,
  "orderIndex": 7,
  "settings": {
    "recommendedMinutes": 12
  },
  "questions": [
    {
      "id": "prebuilt-se-behavioral-conflict",
      "questionText": "Tell us about a time you had a technical disagreement with a teammate. What changed your mind or theirs?",
      "questionType": "short_answer",
      "rubric": [
        "collaboration",
        "evidence",
        "humility",
        "decision-quality"
      ]
    },
    {
      "id": "prebuilt-se-behavioral-ownership",
      "questionText": "Describe a time you owned a problem beyond your assigned ticket. What was the outcome?",
      "questionType": "short_answer",
      "rubric": [
        "ownership",
        "initiative",
        "impact",
        "follow-through"
      ]
    },
    {
      "id": "prebuilt-se-behavioral-failure",
      "questionText": "Tell us about a feature or fix that did not work as expected. What did you learn?",
      "questionType": "short_answer",
      "rubric": [
        "reflection",
        "accountability",
        "technical-learning",
        "prevention"
      ]
    },
    {
      "id": "prebuilt-se-behavioral-product",
      "questionText": "Give an example of when user or customer impact changed your technical approach.",
      "questionType": "short_answer",
      "rubric": [
        "user-focus",
        "trade-offs",
        "product-thinking",
        "impact"
      ]
    },
    {
      "id": "prebuilt-se-behavioral-learning",
      "questionText": "How did you learn a new tool, framework, or codebase under time pressure?",
      "questionType": "short_answer",
      "rubric": [
        "learning-strategy",
        "resourcefulness",
        "execution",
        "communication"
      ]
    }
  ]
};
