import type { PrebuiltModuleDefinition } from "../types";

export const hrLeadershipModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-hr-leadership",
  "type": "leadership",
  "title": "Manager Advisory and Employee Relations Judgment",
  "description": "Assesses HR partnership with managers, conflict mediation, policy rollouts, and fair escalation decisions.",
  "weight": 1.15,
  "orderIndex": 5,
  "settings": {
    "recommendedMinutes": 14
  },
  "questions": [
    {
      "id": "prebuilt-hr-leadership-termination-pressure",
      "questionText": "A manager asks HR to terminate an employee immediately without documentation. What do you do?",
      "questionType": "scenario",
      "rubric": [
        "risk-management",
        "policy-process",
        "manager-coaching",
        "fairness",
        "escalation"
      ]
    },
    {
      "id": "prebuilt-hr-leadership-feedback-coaching",
      "questionText": "How would you coach a manager who gives vague negative feedback but expects HR to solve the performance issue?",
      "questionType": "scenario",
      "rubric": [
        "manager-coaching",
        "specificity",
        "accountability",
        "documentation",
        "employee-fairness"
      ]
    },
    {
      "id": "prebuilt-hr-leadership-team-conflict",
      "questionText": "Two team members accuse each other of disrespectful behavior. What process would you follow before recommending action?",
      "questionType": "scenario",
      "rubric": [
        "neutrality",
        "fact-finding",
        "confidentiality",
        "de-escalation",
        "resolution-path"
      ]
    },
    {
      "id": "prebuilt-hr-leadership-policy-rollout",
      "questionText": "You need to roll out a new attendance policy that managers support but employees may dislike. How would you communicate it?",
      "questionType": "short_answer",
      "rubric": [
        "change-communication",
        "stakeholder-planning",
        "empathy",
        "consistency"
      ]
    },
    {
      "id": "prebuilt-hr-leadership-complaint",
      "questionText": "An employee raises a complaint involving a senior manager. How do you protect fairness and trust in the process?",
      "questionType": "scenario",
      "rubric": [
        "independence",
        "confidentiality",
        "escalation",
        "anti-retaliation-awareness",
        "documentation"
      ]
    }
  ]
};
