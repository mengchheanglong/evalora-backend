import type { PrebuiltModuleDefinition } from "../types";

export const hrCommunicationModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-hr-communication",
  "type": "communication",
  "title": "Candidate and Manager Communication",
  "description": "Assesses candidate-facing clarity, manager updates, written communication, empathy, and expectation setting.",
  "weight": 1.1,
  "orderIndex": 2,
  "settings": {
    "recommendedMinutes": 14,
    "roleplay": true
  },
  "questions": [
    {
      "id": "prebuilt-hr-communication-delayed-offer",
      "questionText": "Roleplay explaining a delayed offer decision to a candidate while keeping trust and professionalism.",
      "questionType": "roleplay",
      "rubric": [
        "clarity",
        "empathy",
        "expectation-setting",
        "professionalism"
      ]
    },
    {
      "id": "prebuilt-hr-communication-pipeline-risk",
      "questionText": "Write a concise update to a department head about a hiring pipeline risk and the next actions you recommend.",
      "questionType": "short_answer",
      "rubric": [
        "conciseness",
        "risk-framing",
        "action-orientation",
        "stakeholder-awareness"
      ]
    },
    {
      "id": "prebuilt-hr-communication-rejection",
      "questionText": "Write a respectful rejection message to a strong candidate who reached the final round but was not selected.",
      "questionType": "short_answer",
      "rubric": [
        "respect",
        "brevity",
        "brand-protection",
        "candidate-experience"
      ]
    },
    {
      "id": "prebuilt-hr-communication-policy",
      "questionText": "A manager says an attendance policy is unfair. Explain how you would respond without escalating defensiveness.",
      "questionType": "roleplay",
      "rubric": [
        "policy-clarity",
        "empathy",
        "de-escalation",
        "consistency"
      ]
    },
    {
      "id": "prebuilt-hr-communication-documentation",
      "questionText": "Write a short message to a manager explaining why performance concerns need timely documentation before HR action.",
      "questionType": "short_answer",
      "rubric": [
        "clarity",
        "risk-awareness",
        "manager-coaching",
        "professional-tone"
      ]
    }
  ]
};
