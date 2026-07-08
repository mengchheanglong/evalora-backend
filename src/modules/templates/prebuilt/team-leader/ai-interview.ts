import type { PrebuiltModuleDefinition } from "../types";

export const teamLeaderAiInterviewModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-leader-ai-interview",
  "type": "ai_interview",
  "title": "Modern Leadership Case Interview",
  "description": "Modern leadership case prompts covering team design, AI adoption, hiring fairness, culture-add, and data-informed leadership.",
  "weight": 1.05,
  "orderIndex": 6,
  "settings": {
    "recommendedMinutes": 12,
    "allowFollowUps": true
  },
  "questions": [
    {
      "id": "prebuilt-leader-ai-team-case",
      "questionText": "You inherit a team with low trust, unclear ownership, and missed delivery. What is your 30-day plan?",
      "questionType": "scenario",
      "rubric": [
        "diagnosis",
        "prioritization",
        "trust-building",
        "execution",
        "measurement"
      ]
    },
    {
      "id": "prebuilt-leader-ai-adoption",
      "questionText": "Your team wants to use AI tools to move faster. What rules or review habits would you put in place?",
      "questionType": "scenario",
      "rubric": [
        "ai-risk-awareness",
        "quality-control",
        "security",
        "team-enablement"
      ]
    },
    {
      "id": "prebuilt-leader-ai-hiring",
      "questionText": "How would you interview candidates fairly while still checking whether they can do the real work?",
      "questionType": "scenario",
      "rubric": [
        "structured-interviewing",
        "rubric-use",
        "fairness",
        "job-relevance"
      ]
    },
    {
      "id": "prebuilt-leader-ai-culture-add",
      "questionText": "What does culture-add mean to you, and how would you avoid hiring only people who think like the current team?",
      "questionType": "short_answer",
      "rubric": [
        "inclusion",
        "team-awareness",
        "structured-criteria",
        "self-awareness"
      ]
    },
    {
      "id": "prebuilt-leader-ai-reporting",
      "questionText": "A dashboard shows output is up but quality and morale are down. What would you investigate before celebrating the output metric?",
      "questionType": "scenario",
      "rubric": [
        "metric-interpretation",
        "quality-awareness",
        "team-health",
        "balanced-judgment"
      ]
    }
  ]
};
