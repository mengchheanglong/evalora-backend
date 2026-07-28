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
        "confidentiality",
        "fairness",
        "empathy",
        "policy-awareness",
        "evidence"
      ]
    },
    {
      "id": "prebuilt-hr-behavioral-process-integrity",
      "questionText": "How would you handle a hiring manager who wants to skip a required interview or documentation step?",
      "questionType": "scenario",
      "rubric": [
        "process-discipline",
        "stakeholder-communication",
        "risk-management",
        "professionalism"
      ]
    },
    {
      "id": "prebuilt-hr-behavioral-conflict",
      "questionText": "Tell us about a time you helped resolve conflict between employees, managers, or candidates. What did you do first?",
      "questionType": "short_answer",
      "rubric": [
        "listening",
        "neutrality",
        "evidence-gathering",
        "resolution",
        "follow-up"
      ]
    },
    {
      "id": "prebuilt-hr-behavioral-change",
      "questionText": "Describe a time an HR policy or process changed quickly. How did you adapt and help others understand the change?",
      "questionType": "short_answer",
      "rubric": [
        "adaptability",
        "communication",
        "policy-understanding",
        "change-management"
      ]
    },
    {
      "id": "prebuilt-hr-behavioral-failure",
      "questionText": "Tell us about an HR or administrative mistake you made. How did you fix it and prevent it from happening again?",
      "questionType": "short_answer",
      "rubric": [
        "ownership",
        "transparency",
        "root-cause-analysis",
        "process-improvement"
      ]
    }
  ]
};
