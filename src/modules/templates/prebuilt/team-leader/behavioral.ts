import type { PrebuiltModuleDefinition } from "../types";

export const teamLeaderBehavioralModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-leader-behavioral",
  "type": "behavioral",
  "title": "Leadership Behavior and Life Story",
  "description": "Explores coaching, hard decisions, accountability, influence, and learning from misses.",
  "weight": 1.0,
  "orderIndex": 3,
  "settings": {
    "recommendedMinutes": 12
  },
  "questions": [
    {
      "id": "prebuilt-leader-behavioral-coaching",
      "questionText": "Tell us about a time you helped someone improve without taking the work away from them.",
      "questionType": "short_answer",
      "rubric": [
        "coaching",
        "delegation",
        "ownership",
        "outcome-evidence"
      ]
    },
    {
      "id": "prebuilt-leader-behavioral-failure",
      "questionText": "Tell us about a leadership mistake that had real consequences for your team or project. What specifically did you do wrong, how did you take accountability, and what changes did you make to your leadership afterward?",
      "questionType": "short_answer",
      "rubric": [
        "accountability",
        "reflection",
        "behavior-change",
        "team-impact"
      ]
    },
    {
      "id": "prebuilt-leader-behavioral-influence",
      "questionText": "Describe a time you influenced people without formal authority.",
      "questionType": "short_answer",
      "rubric": [
        "influence",
        "stakeholder-awareness",
        "communication",
        "outcome"
      ]
    },
    {
      "id": "prebuilt-leader-behavioral-hard-decision",
      "questionText": "Describe a necessary decision you made that disappointed or upset some team members — for example cutting a feature, changing priorities, or a performance action. How did you communicate it and handle the aftermath?",
      "questionType": "short_answer",
      "rubric": [
        "decision-quality",
        "fairness",
        "communication",
        "resilience"
      ]
    },
    {
      "id": "prebuilt-leader-behavioral-recognition",
      "questionText": "How do you recognize strong work without creating unhealthy competition?",
      "questionType": "short_answer",
      "rubric": [
        "motivation",
        "fairness",
        "team-culture",
        "specificity"
      ]
    }
  ]
};
