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
        "speak with each person separately first",
        "separate the technical issue from the personal one",
        "make the call and explain the reasoning",
        "own the decision rather than defer it",
        "tell the wider team what was agreed"
      ]
    },
    {
      "id": "prebuilt-leader-leadership-missed-deadline",
      "questionText": "Your team is likely to miss an important deadline. What do you communicate, what do you change, and how do you protect trust?",
      "questionType": "scenario",
      "rubric": [
        "say what will ship and what will not",
        "warn stakeholders before the date passes",
        "protect the riskiest work first",
        "take the miss as the leader's own"
      ]
    },
    {
      "id": "prebuilt-leader-leadership-underperformer",
      "questionText": "A reliable team member starts missing deadlines and says they are overloaded. How do you handle it?",
      "questionType": "scenario",
      "rubric": [
        "ask what changed before judging",
        "look at the real workload and priorities",
        "agree what to drop or reassign",
        "set clear expectations and a date",
        "check progress rather than assume"
      ]
    },
    {
      "id": "prebuilt-leader-leadership-burnout",
      "questionText": "The team is burned out after several urgent releases. What would you change in the next month?",
      "questionType": "scenario",
      "rubric": [
        "name the burnout signals they watch for",
        "cut or delay committed work",
        "change the pace, not just grant a day off",
        "tell stakeholders what slows down and why"
      ]
    },
    {
      "id": "prebuilt-leader-leadership-delegation",
      "questionText": "How do you decide what to delegate, what to inspect, and what to own yourself?",
      "questionType": "short_answer",
      "rubric": [
        "match the task to the person's level",
        "agree the check-in points up front",
        "keep the calls that carry real risk",
        "let people learn from small mistakes"
      ]
    },
    {
      "id": "prebuilt-leader-leadership-peer-conflict",
      "questionText": "Two high-performing team members are in conflict over a technical approach. It has become personal and is hurting morale. How do you handle it in the next 48 hours, and what is your longer-term approach?",
      "questionType": "scenario",
      "rubric": [
        "act within days rather than hope it settles",
        "talk to each person one to one",
        "name the behaviour, not the personality",
        "apply the same standard to both",
        "check the team mood weeks later"
      ]
    }
  ]
};
