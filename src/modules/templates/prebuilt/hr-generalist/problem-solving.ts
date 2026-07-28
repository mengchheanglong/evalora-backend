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
        "separate hiring, manager, and role causes",
        "use exit conversations and start-date data",
        "involve the managers who run the process",
        "propose changes with owners and dates",
        "say which number would prove it worked"
      ]
    },
    {
      "id": "prebuilt-hr-problem-solving-turnover",
      "questionText": "A department has 25% turnover in six months. What data would you review first, and what actions might you recommend?",
      "questionType": "scenario",
      "rubric": [
        "name the data to pull first and why",
        "form testable causes before acting",
        "ask leavers and stayers what changed",
        "propose actions the manager can run",
        "set a review point to check the effect"
      ]
    },
    {
      "id": "prebuilt-hr-problem-solving-payroll",
      "questionText": "An employee reports a payroll discrepancy and is upset. How do you handle the issue from intake to resolution?",
      "questionType": "scenario",
      "rubric": [
        "treat missing pay as same-day urgent",
        "verify the figures before replying",
        "chase finance or payroll to a resolution",
        "keep the employee updated while it is open",
        "record the cause and the correction"
      ]
    },
    {
      "id": "prebuilt-hr-problem-solving-absenteeism",
      "questionText": "You notice repeated absenteeism in one team. How would you investigate without making unfair assumptions?",
      "questionType": "scenario",
      "rubric": [
        "avoid assuming a reason from a pattern",
        "check the attendance records first",
        "ask the manager what changed in the team",
        "offer support before applying sanctions",
        "follow the absence policy and any legal duty"
      ]
    },
    {
      "id": "prebuilt-hr-problem-solving-funnel",
      "questionText": "A role has many applicants but few qualified interviews. How would you improve the recruiting funnel?",
      "questionType": "scenario",
      "rubric": [
        "find the stage where candidates drop out",
        "question whether the advert matches the job",
        "tighten the screening criteria with the manager",
        "agree what qualified actually means",
        "track the change in interview-to-offer rate"
      ]
    }
  ]
};
