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
        "name the conditions they work best in",
        "raise the limit before quality slips",
        "propose what to drop or delay",
        "own the commitment they already made"
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
        "record decisions at the time they are made",
        "say what they do when details are missing",
        "keep the same standard under time pressure"
      ]
    },
    {
      "id": "prebuilt-hr-work-style-prioritization",
      "questionText": "Three urgent requests arrive at once: payroll error, candidate offer deadline, and manager policy question. How do you prioritize?",
      "questionType": "scenario",
      "rubric": [
        "rank by harm caused and by deadline",
        "treat a pay problem as time critical",
        "name the legal or compliance risk",
        "tell the waiting people when to expect a reply"
      ]
    },
    {
      "id": "prebuilt-hr-work-style-confidentiality",
      "questionText": "What daily habits help you protect confidential employee and candidate information?",
      "questionType": "short_answer",
      "rubric": [
        "keep records in the approved system only",
        "share on a need-to-know basis",
        "describe a habit such as locking screens",
        "apply it to casual conversation too"
      ]
    },
    {
      "id": "prebuilt-hr-work-style-service",
      "questionText": "How do you stay helpful to employees while still enforcing policy consistently?",
      "questionType": "short_answer",
      "rubric": [
        "listen before quoting the policy",
        "explain what they can and cannot do",
        "apply the rule the same way for everyone",
        "escalate rather than quietly make an exception"
      ]
    }
  ]
};
