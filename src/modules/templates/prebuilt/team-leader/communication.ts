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
        "cite the specific behaviour and its effect",
        "acknowledge their strong contribution",
        "say the hard part plainly",
        "agree what changes and by when",
        "invite their side of the story"
      ]
    },
    {
      "id": "prebuilt-leader-communication-risk",
      "questionText": "Your flagship project is at risk of missing its deadline by three weeks and the recovery plan is only about 60% finalized. Write a stakeholder update (max 150 words) that stays transparent while maintaining confidence.",
      "questionType": "short_answer",
      "rubric": [
        "state the slip and the new date up front",
        "say what is still uncertain in the plan",
        "stay inside the word limit",
        "list the next actions and their owners"
      ]
    },
    {
      "id": "prebuilt-leader-communication-priority-change",
      "questionText": "How would you explain a sudden priority change to a team that already committed to other work?",
      "questionType": "roleplay",
      "rubric": [
        "explain what changed outside the team",
        "acknowledge the work being dropped",
        "connect the change to a shared goal",
        "state exactly what to stop and start"
      ]
    },
    {
      "id": "prebuilt-leader-communication-one-on-one",
      "questionText": "A previously high-performing team member has become disengaged — missing deadlines, quiet in meetings, low energy. In your next one-on-one, what specific questions do you ask, and how do you create the safety for them to be honest?",
      "questionType": "short_answer",
      "rubric": [
        "ask open questions rather than accuse",
        "leave silence for them to answer",
        "separate workload, health, and motivation",
        "offer help without demanding disclosure"
      ]
    },
    {
      "id": "prebuilt-leader-communication-escalation",
      "questionText": "When should a team leader escalate a problem versus solving it inside the team? Give examples of what you would handle yourself, what you would escalate immediately, and what you would escalate only after attempting a fix — and the framework you use.",
      "questionType": "short_answer",
      "rubric": [
        "give examples at each escalation level",
        "escalate anything with legal or safety risk",
        "attempt a fix before escalating the rest",
        "bring options, not just the problem"
      ]
    }
  ]
};
