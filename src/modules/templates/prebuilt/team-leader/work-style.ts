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
        "protect blocks of time for their own work",
        "decide which interruptions they absorb",
        "say no or renegotiate the deadline",
        "tell the team where their attention is"
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
        "decide rather than wait for certainty",
        "name the safeguard used for reversible calls",
        "know which decisions they find hard",
        "share the reasoning with the team"
      ]
    },
    {
      "id": "prebuilt-leader-work-style-meetings",
      "questionText": "Which meetings or rituals would you keep for a small delivery team, and which would you avoid?",
      "questionType": "short_answer",
      "rubric": [
        "keep only meetings with a clear purpose",
        "name what each ritual should produce",
        "cut status meetings a written update covers",
        "leave the team uninterrupted days"
      ]
    },
    {
      "id": "prebuilt-leader-work-style-docs",
      "questionText": "How do you use written updates or documentation to reduce confusion on the team?",
      "questionType": "short_answer",
      "rubric": [
        "write decisions where people can find them",
        "record the owner and the date",
        "explain the reasoning, not only the outcome",
        "reduce the need to be in the room"
      ]
    },
    {
      "id": "prebuilt-leader-work-style-delegation-limits",
      "questionText": "What signs tell you that delegation is working, and what signs tell you you need to step in?",
      "questionType": "short_answer",
      "rubric": [
        "name the signs that the work is on track",
        "inspect the output, not the hours",
        "coach before taking the work back",
        "step in when risk or harm is rising"
      ]
    }
  ]
};
