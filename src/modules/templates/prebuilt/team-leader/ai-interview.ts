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
        "listen to each person before changing anything",
        "pick one or two problems to fix first",
        "do something visible in the first weeks",
        "make ownership explicit for each area",
        "say which improvement they would measure"
      ]
    },
    {
      "id": "prebuilt-leader-ai-adoption",
      "questionText": "Your team wants to use AI tools to move faster. What rules or review habits would you put in place?",
      "questionType": "scenario",
      "rubric": [
        "name where generated output cannot be trusted",
        "keep human review before anything ships",
        "keep customer data out of external tools",
        "train the team rather than only restrict them"
      ]
    },
    {
      "id": "prebuilt-leader-ai-hiring",
      "questionText": "How would you interview candidates fairly while still checking whether they can do the real work?",
      "questionType": "scenario",
      "rubric": [
        "ask every candidate the same core questions",
        "score answers against agreed criteria",
        "guard against gut feel and similarity bias",
        "use a task that mirrors the real work"
      ]
    },
    {
      "id": "prebuilt-leader-ai-culture-add",
      "questionText": "What does culture-add mean to you, and how would you avoid hiring only people who think like the current team?",
      "questionType": "short_answer",
      "rubric": [
        "define culture-add against values, not sameness",
        "name a gap the current team has",
        "set criteria before meeting candidates",
        "admit their own likely bias"
      ]
    },
    {
      "id": "prebuilt-leader-ai-reporting",
      "questionText": "A dashboard shows output is up but quality and morale are down. What would you investigate before celebrating the output metric?",
      "questionType": "scenario",
      "rubric": [
        "ask what the output number is missing",
        "check defects and rework alongside output",
        "talk to the team about the morale signal",
        "resist celebrating one number in isolation"
      ]
    }
  ]
};
