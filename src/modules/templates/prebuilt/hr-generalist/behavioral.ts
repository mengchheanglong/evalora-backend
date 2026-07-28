import type { PrebuiltModuleDefinition } from "../types";

export const hrBehavioralModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-hr-behavioral",
  "type": "behavioral",
  "title": "Behavioral and STAR Interview",
  "description": "Checks past behavior around confidentiality, fairness, adaptability, conflict, and learning from mistakes.",
  "weight": 1.15,
  "orderIndex": 1,
  "settings": {
    "recommendedMinutes": 15,
    "allowFollowUps": true
  },
  "questions": [
    {
      "id": "prebuilt-hr-behavioral-sensitive-issue",
      "questionText": "Tell us about a time you handled a sensitive employee or candidate issue while staying fair and confidential.",
      "questionType": "scenario",
      "rubric": [
        "limit who the details were shared with",
        "hear both sides before concluding",
        "acknowledge how the person felt",
        "follow the policy that applied",
        "record the facts rather than impressions"
      ]
    },
    {
      "id": "prebuilt-hr-behavioral-process-integrity",
      "questionText": "How would you handle a hiring manager who wants to skip a required interview or documentation step?",
      "questionType": "scenario",
      "rubric": [
        "explain why the step exists",
        "offer a faster route that still complies",
        "name the legal or fairness risk of skipping",
        "hold the line without making it personal"
      ]
    },
    {
      "id": "prebuilt-hr-behavioral-conflict",
      "questionText": "Tell us about a time you helped resolve conflict between employees, managers, or candidates. What did you do first?",
      "questionType": "short_answer",
      "rubric": [
        "hear each person separately first",
        "avoid taking a side too early",
        "gather what was actually said or done",
        "agree a concrete resolution",
        "check back after an agreed period"
      ]
    },
    {
      "id": "prebuilt-hr-behavioral-change",
      "questionText": "Describe a time an HR policy or process changed quickly. How did you adapt and help others understand the change?",
      "questionType": "short_answer",
      "rubric": [
        "explain what changed and why",
        "answer the questions people actually asked",
        "apply the new policy consistently",
        "help managers deliver the message"
      ]
    },
    {
      "id": "prebuilt-hr-behavioral-failure",
      "questionText": "Tell us about an HR or administrative mistake you made. How did you fix it and prevent it from happening again?",
      "questionType": "short_answer",
      "rubric": [
        "state the mistake without softening it",
        "tell the affected people promptly",
        "explain how the mistake happened",
        "describe the check added afterward"
      ]
    }
  ]
};
