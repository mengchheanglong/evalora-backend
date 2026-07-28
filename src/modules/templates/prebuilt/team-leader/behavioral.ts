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
        "ask questions instead of giving the answer",
        "leave the work with the other person",
        "stay accountable for the result",
        "give evidence the person improved"
      ]
    },
    {
      "id": "prebuilt-leader-behavioral-failure",
      "questionText": "Tell us about a leadership mistake that had real consequences for your team or project. What specifically did you do wrong, how did you take accountability, and what changes did you make to your leadership afterward?",
      "questionType": "short_answer",
      "rubric": [
        "state the specific mistake they made",
        "avoid blaming the team or circumstances",
        "describe what they lead differently now",
        "say how the team was affected"
      ]
    },
    {
      "id": "prebuilt-leader-behavioral-influence",
      "questionText": "Describe a time you influenced people without formal authority.",
      "questionType": "short_answer",
      "rubric": [
        "identify who needed convincing and why",
        "use evidence rather than position",
        "adapt the argument to each audience",
        "say what was agreed in the end"
      ]
    },
    {
      "id": "prebuilt-leader-behavioral-hard-decision",
      "questionText": "Describe a necessary decision you made that disappointed or upset some team members — for example cutting a feature, changing priorities, or a performance action. How did you communicate it and handle the aftermath?",
      "questionType": "short_answer",
      "rubric": [
        "explain the reasoning behind the call",
        "treat the affected people consistently",
        "deliver the news directly, not by proxy",
        "stay steady through the reaction"
      ]
    },
    {
      "id": "prebuilt-leader-behavioral-recognition",
      "questionText": "How do you recognize strong work without creating unhealthy competition?",
      "questionType": "short_answer",
      "rubric": [
        "praise specific work, not personality",
        "recognise quiet contributions too",
        "credit the team as well as individuals",
        "avoid rankings that pit people against each other"
      ]
    }
  ]
};
