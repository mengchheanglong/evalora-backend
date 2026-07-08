import type { PrebuiltModuleDefinition } from "../types";

export const teamLeaderProblemSolvingModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-leader-problem-solving",
  "type": "problem_solving",
  "title": "Team Problem Solving and Execution",
  "description": "Tests diagnosis and decision-making for ambiguous delivery, quality, resource, and customer-impact problems.",
  "weight": 1.25,
  "orderIndex": 4,
  "settings": {
    "recommendedMinutes": 16
  },
  "questions": [
    {
      "id": "prebuilt-leader-problem-solving-quality-drop",
      "questionText": "Quality has dropped for three sprints while the team still reports being busy. How would you find the real problem and fix the operating rhythm?",
      "questionType": "scenario",
      "rubric": [
        "root-cause-analysis",
        "metrics",
        "prioritization",
        "team-process",
        "follow-through"
      ]
    },
    {
      "id": "prebuilt-leader-problem-solving-overloaded",
      "questionText": "Your team has capacity for two of five urgent tasks. How do you decide what to cut, delay, delegate, or escalate?",
      "questionType": "scenario",
      "rubric": [
        "prioritization",
        "trade-off-reasoning",
        "stakeholder-management",
        "execution-plan"
      ]
    },
    {
      "id": "prebuilt-leader-problem-solving-bottleneck",
      "questionText": "One senior teammate has become the bottleneck for every decision. What would you change?",
      "questionType": "scenario",
      "rubric": [
        "process-design",
        "delegation",
        "risk-management",
        "team-growth"
      ]
    },
    {
      "id": "prebuilt-leader-problem-solving-customer",
      "questionText": "A customer complains about repeated mistakes from your team. What do you do in the first 48 hours?",
      "questionType": "scenario",
      "rubric": [
        "customer-focus",
        "containment",
        "root-cause-analysis",
        "communication",
        "prevention"
      ]
    },
    {
      "id": "prebuilt-leader-problem-solving-metrics",
      "questionText": "What metrics would you track to know whether your team is improving?",
      "questionType": "short_answer",
      "rubric": [
        "metric-selection",
        "balance",
        "actionability",
        "team-health"
      ]
    }
  ]
};
