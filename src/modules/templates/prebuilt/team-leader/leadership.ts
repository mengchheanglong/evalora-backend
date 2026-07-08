import type { PrebuiltModuleDefinition } from "../types";

export const teamLeaderLeadershipModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-leader-leadership",
  "type": "leadership",
  "title": "Leadership Scenarios",
  "description": "Assesses decision-making, accountability, conflict resolution, delegation, motivation, and team alignment.",
  "weight": 1.4,
  "orderIndex": 1,
  "settings": {
    "recommendedMinutes": 18,
    "allowFollowUps": true
  },
  "questions": [
    {
      "id": "prebuilt-leader-leadership-conflict",
      "questionText": "Two strong team members disagree publicly and progress is blocked. How would you handle the conflict and keep delivery moving?",
      "questionType": "scenario",
      "rubric": [
        "conflict-resolution",
        "decision-making",
        "team-alignment",
        "accountability",
        "communication"
      ]
    },
    {
      "id": "prebuilt-leader-leadership-missed-deadline",
      "questionText": "Your team is likely to miss an important deadline. What do you communicate, what do you change, and how do you protect trust?",
      "questionType": "scenario",
      "rubric": [
        "prioritization",
        "stakeholder-management",
        "risk-management",
        "ownership"
      ]
    },
    {
      "id": "prebuilt-leader-leadership-underperformer",
      "questionText": "A reliable team member starts missing deadlines and says they are overloaded. How do you handle it?",
      "questionType": "scenario",
      "rubric": [
        "empathy",
        "performance-management",
        "workload-analysis",
        "action-plan",
        "follow-up"
      ]
    },
    {
      "id": "prebuilt-leader-leadership-burnout",
      "questionText": "The team is burned out after several urgent releases. What would you change in the next month?",
      "questionType": "scenario",
      "rubric": [
        "team-health",
        "prioritization",
        "sustainable-pace",
        "stakeholder-communication"
      ]
    },
    {
      "id": "prebuilt-leader-leadership-delegation",
      "questionText": "How do you decide what to delegate, what to inspect, and what to own yourself?",
      "questionType": "short_answer",
      "rubric": [
        "delegation",
        "trust",
        "risk-awareness",
        "coaching"
      ]
    }
  ]
};
