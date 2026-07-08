import type { PrebuiltModuleDefinition } from "../types";

export const teamLeaderCommunicationModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-leader-communication",
  "type": "communication",
  "title": "Leadership Communication Roleplay",
  "description": "Checks feedback, stakeholder updates, escalation, one-on-ones, and clarity under pressure.",
  "weight": 1.15,
  "orderIndex": 2,
  "settings": {
    "recommendedMinutes": 14,
    "roleplay": true
  },
  "questions": [
    {
      "id": "prebuilt-leader-communication-feedback",
      "questionText": "Roleplay giving constructive feedback to a high-performing teammate whose behavior is hurting collaboration.",
      "questionType": "roleplay",
      "rubric": [
        "specificity",
        "empathy",
        "directness",
        "action-plan",
        "psychological-safety"
      ]
    },
    {
      "id": "prebuilt-leader-communication-risk",
      "questionText": "Write a concise stakeholder update when a project is at risk but the recovery plan is not final yet.",
      "questionType": "short_answer",
      "rubric": [
        "transparency",
        "risk-framing",
        "brevity",
        "next-steps"
      ]
    },
    {
      "id": "prebuilt-leader-communication-priority-change",
      "questionText": "How would you explain a sudden priority change to a team that already committed to other work?",
      "questionType": "roleplay",
      "rubric": [
        "context-setting",
        "empathy",
        "alignment",
        "decision-clarity"
      ]
    },
    {
      "id": "prebuilt-leader-communication-one-on-one",
      "questionText": "What questions would you ask in a one-on-one with a team member who seems disengaged?",
      "questionType": "short_answer",
      "rubric": [
        "listening",
        "support",
        "diagnosis",
        "trust-building"
      ]
    },
    {
      "id": "prebuilt-leader-communication-escalation",
      "questionText": "When should a team leader escalate a problem instead of trying to solve it inside the team?",
      "questionType": "short_answer",
      "rubric": [
        "judgment",
        "risk-awareness",
        "ownership",
        "stakeholder-management"
      ]
    }
  ]
};
