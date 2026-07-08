import type { PrebuiltModuleDefinition } from "../types";

export const teamLeaderWorkStyleModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-leader-work-style",
  "type": "work_style",
  "title": "Team Operating Style",
  "description": "Explores personal leadership rhythm, decision-making, meeting discipline, documentation, and delegation boundaries.",
  "weight": 1.0,
  "orderIndex": 5,
  "settings": {
    "recommendedMinutes": 10
  },
  "questions": [
    {
      "id": "prebuilt-leader-work-style-priorities",
      "questionText": "How do you keep your own priorities clear when your team receives many interruptions?",
      "questionType": "short_answer",
      "rubric": [
        "focus",
        "prioritization",
        "boundary-setting",
        "communication"
      ]
    },
    {
      "id": "prebuilt-leader-work-style-decisions",
      "questionText": "Rate how comfortable you are making decisions with incomplete information and explain your safeguards.",
      "questionType": "scale",
      "options": {
        "min": 1,
        "max": 5,
        "labels": [
          "avoid it",
          "comfortable with safeguards"
        ]
      },
      "rubric": [
        "decision-making",
        "risk-control",
        "self-awareness",
        "communication"
      ]
    },
    {
      "id": "prebuilt-leader-work-style-meetings",
      "questionText": "Which meetings or rituals would you keep for a small delivery team, and which would you avoid?",
      "questionType": "short_answer",
      "rubric": [
        "meeting-discipline",
        "team-rhythm",
        "simplicity",
        "outcome-focus"
      ]
    },
    {
      "id": "prebuilt-leader-work-style-docs",
      "questionText": "How do you use written updates or documentation to reduce confusion on the team?",
      "questionType": "short_answer",
      "rubric": [
        "clarity",
        "async-communication",
        "accountability",
        "context-sharing"
      ]
    },
    {
      "id": "prebuilt-leader-work-style-delegation-limits",
      "questionText": "What signs tell you that delegation is working, and what signs tell you you need to step in?",
      "questionType": "short_answer",
      "rubric": [
        "delegation",
        "inspection",
        "coaching",
        "risk-awareness"
      ]
    }
  ]
};
