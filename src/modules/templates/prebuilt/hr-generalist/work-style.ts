import type { PrebuiltModuleDefinition } from "../types";

export const hrWorkStyleModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-hr-work-style",
  "type": "work_style",
  "title": "HR Work Style and Operating Habits",
  "description": "Explores organization, workload ownership, documentation, service mindset, and confidentiality habits.",
  "weight": 1.0,
  "orderIndex": 3,
  "settings": {
    "recommendedMinutes": 12
  },
  "questions": [
    {
      "id": "prebuilt-hr-work-style-workload",
      "questionText": "Which work environment helps you perform best, and how do you communicate workload limits before quality drops?",
      "questionType": "short_answer",
      "rubric": [
        "self-awareness",
        "communication",
        "ownership",
        "prioritization"
      ]
    },
    {
      "id": "prebuilt-hr-work-style-documentation",
      "questionText": "Rate how consistently you document hiring decisions and explain what you do when details are missing.",
      "questionType": "scale",
      "options": {
        "min": 1,
        "max": 5,
        "labels": [
          "rarely",
          "always"
        ]
      },
      "rubric": [
        "documentation",
        "accountability",
        "process-consistency"
      ]
    },
    {
      "id": "prebuilt-hr-work-style-prioritization",
      "questionText": "Three urgent requests arrive at once: payroll error, candidate offer deadline, and manager policy question. How do you prioritize?",
      "questionType": "scenario",
      "rubric": [
        "urgency-assessment",
        "employee-impact",
        "risk-management",
        "communication"
      ]
    },
    {
      "id": "prebuilt-hr-work-style-confidentiality",
      "questionText": "What daily habits help you protect confidential employee and candidate information?",
      "questionType": "short_answer",
      "rubric": [
        "privacy-awareness",
        "systems-discipline",
        "need-to-know",
        "consistency"
      ]
    },
    {
      "id": "prebuilt-hr-work-style-service",
      "questionText": "How do you stay helpful to employees while still enforcing policy consistently?",
      "questionType": "short_answer",
      "rubric": [
        "service-mindset",
        "boundaries",
        "fairness",
        "policy-consistency"
      ]
    }
  ]
};
