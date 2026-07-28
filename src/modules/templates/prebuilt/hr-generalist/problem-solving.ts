import type { PrebuiltModuleDefinition } from "../types";

export const hrProblemSolvingModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-hr-problem-solving",
  "type": "problem_solving",
  "title": "People Process Problem Solving",
  "description": "Tests structured diagnosis and improvement planning for HR operations, hiring funnels, onboarding, and workforce issues.",
  "weight": 1.2,
  "orderIndex": 4,
  "settings": {
    "recommendedMinutes": 18
  },
  "questions": [
    {
      "id": "prebuilt-hr-problem-solving-onboarding-dropoff",
      "questionText": "A new-hire onboarding process has high drop-off in the first two weeks. How would you diagnose the causes and improve it?",
      "questionType": "scenario",
      "rubric": [
        "root-cause-analysis",
        "data-use",
        "stakeholder-collaboration",
        "implementation-plan",
        "measurement"
      ]
    },
    {
      "id": "prebuilt-hr-problem-solving-turnover",
      "questionText": "A department has 25% turnover in six months. What data would you review first, and what actions might you recommend?",
      "questionType": "scenario",
      "rubric": [
        "data-selection",
        "hypothesis-building",
        "employee-experience",
        "action-plan",
        "measurement"
      ]
    },
    {
      "id": "prebuilt-hr-problem-solving-payroll",
      "questionText": "An employee reports a payroll discrepancy and is upset. How do you handle the issue from intake to resolution?",
      "questionType": "scenario",
      "rubric": [
        "urgency",
        "accuracy",
        "cross-functional-follow-up",
        "communication",
        "documentation"
      ]
    },
    {
      "id": "prebuilt-hr-problem-solving-absenteeism",
      "questionText": "You notice repeated absenteeism in one team. How would you investigate without making unfair assumptions?",
      "questionType": "scenario",
      "rubric": [
        "fairness",
        "data-review",
        "manager-consultation",
        "employee-support",
        "policy-awareness"
      ]
    },
    {
      "id": "prebuilt-hr-problem-solving-funnel",
      "questionText": "A role has many applicants but few qualified interviews. How would you improve the recruiting funnel?",
      "questionType": "scenario",
      "rubric": [
        "funnel-analysis",
        "job-description-quality",
        "screening-criteria",
        "stakeholder-alignment",
        "measurement"
      ]
    }
  ]
};
