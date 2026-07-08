import type { PrebuiltModuleDefinition } from "../types";

export const softwareWorkStyleModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-se-work-style",
  "type": "work_style",
  "title": "Engineering Work Style",
  "description": "Explores testing habits, review discipline, AI tool boundaries, ambiguity handling, and team operating style.",
  "weight": 1.0,
  "orderIndex": 6,
  "settings": {
    "recommendedMinutes": 10
  },
  "questions": [
    {
      "id": "prebuilt-se-work-style-testing",
      "questionText": "How do you decide what to test before saying a feature is done?",
      "questionType": "short_answer",
      "rubric": [
        "test-strategy",
        "edge-cases",
        "risk-awareness",
        "definition-of-done"
      ]
    },
    {
      "id": "prebuilt-se-work-style-code-review",
      "questionText": "What do you look for when reviewing someone else's code beyond whether it works?",
      "questionType": "short_answer",
      "rubric": [
        "maintainability",
        "security",
        "readability",
        "test-coverage",
        "architecture-awareness"
      ]
    },
    {
      "id": "prebuilt-se-work-style-ambiguity",
      "questionText": "A ticket is unclear and the deadline is close. What do you do before starting implementation?",
      "questionType": "scenario",
      "rubric": [
        "clarifying-questions",
        "scope-control",
        "communication",
        "execution"
      ]
    },
    {
      "id": "prebuilt-se-work-style-ai-boundaries",
      "questionText": "When is it appropriate to use AI while coding, and what work must remain your responsibility?",
      "questionType": "short_answer",
      "rubric": [
        "ai-judgment",
        "verification",
        "ownership",
        "security-awareness"
      ]
    },
    {
      "id": "prebuilt-se-work-style-pairing",
      "questionText": "Describe your preferred way to pair-program or collaborate on a difficult bug.",
      "questionType": "short_answer",
      "rubric": [
        "collaboration",
        "communication",
        "learning-mindset",
        "focus"
      ]
    }
  ]
};
