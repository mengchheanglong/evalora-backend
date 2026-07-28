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
        "say plainly that the decision is delayed",
        "acknowledge the candidate's position",
        "give a date for the next update",
        "avoid promises that cannot be kept"
      ]
    },
    {
      "id": "prebuilt-hr-communication-pipeline-risk",
      "questionText": "Write a concise update to a department head about a hiring pipeline risk and the next actions you recommend.",
      "questionType": "short_answer",
      "rubric": [
        "lead with the risk in one sentence",
        "quantify the gap in roles or weeks",
        "recommend specific actions",
        "say what the department head must decide"
      ]
    },
    {
      "id": "prebuilt-hr-communication-rejection",
      "questionText": "Write a respectful rejection message to a strong candidate who reached the final round but was not selected.",
      "questionType": "short_answer",
      "rubric": [
        "thank them for the time they invested",
        "decline clearly without false hope",
        "keep it short and free of template filler",
        "leave the door open where that is honest"
      ]
    },
    {
      "id": "prebuilt-hr-communication-policy",
      "questionText": "A manager says an attendance policy is unfair. Explain how you would respond without escalating defensiveness.",
      "questionType": "roleplay",
      "rubric": [
        "restate the concern before answering",
        "explain the reason behind the policy",
        "avoid defending or arguing back",
        "confirm the policy applies to everyone"
      ]
    },
    {
      "id": "prebuilt-hr-communication-documentation",
      "questionText": "Write a short message to a manager explaining why performance concerns need timely documentation before HR action.",
      "questionType": "short_answer",
      "rubric": [
        "explain what the documentation must contain",
        "name the risk of acting without records",
        "give the manager a next step to take",
        "stay collegial rather than legalistic"
      ]
    }
  ]
};
