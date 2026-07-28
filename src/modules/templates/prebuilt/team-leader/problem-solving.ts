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
      "questionText": "Quality metrics have declined for three consecutive sprints, yet velocity is stable and the team reports being busy. How do you diagnose the root cause, what data do you gather, and what changes do you make to the operating rhythm?",
      "questionType": "scenario",
      "rubric": [
        "question why busy did not mean effective",
        "name the quality data to pull first",
        "choose one or two changes, not ten",
        "change the working rhythm, not just the target",
        "set a date to review the effect"
      ]
    },
    {
      "id": "prebuilt-leader-problem-solving-overloaded",
      "questionText": "Your team has capacity for two of five urgent tasks this sprint: (1) a critical bug affecting 10% of users, (2) a Sales-requested feature for an enterprise deal, (3) technical debt frustrating developers, (4) a leadership-requested analytics dashboard, and (5) a performance optimization. Walk through your decision framework — what questions do you ask and who do you consult?",
      "questionType": "scenario",
      "rubric": [
        "rank by user harm and revenue at risk",
        "say what the deferred items cost",
        "ask sales and leadership the missing questions",
        "commit to what the sprint will deliver"
      ]
    },
    {
      "id": "prebuilt-leader-problem-solving-bottleneck",
      "questionText": "A senior team member has become the decision bottleneck — every major decision flows through them, slowing delivery, and they believe they are protecting quality. How do you address it while preserving their engagement and developing other team members?",
      "questionType": "scenario",
      "rubric": [
        "define which decisions still need that person",
        "move routine calls to the rest of the team",
        "keep a review step for risky changes",
        "give others decisions to practise on"
      ]
    },
    {
      "id": "prebuilt-leader-problem-solving-customer",
      "questionText": "A major customer complains about repeated mistakes from your team. In the first 48 hours: what is your immediate response to the customer, how do you investigate internally, what short-term fixes do you apply, and what long-term prevention do you put in place?",
      "questionType": "scenario",
      "rubric": [
        "contact the customer within the first day",
        "stop the repeat mistakes immediately",
        "trace why the errors kept happening",
        "tell the customer what changed, with dates",
        "add the check that prevents a repeat"
      ]
    },
    {
      "id": "prebuilt-leader-problem-solving-metrics",
      "questionText": "You are taking over a struggling team. What leading and lagging indicators would you track to know it is improving? How do you balance output, outcome, and team-health metrics, and what would you do if they conflict — for example, velocity up but quality down?",
      "questionType": "short_answer",
      "rubric": [
        "name a leading and a lagging indicator",
        "pair output numbers with quality numbers",
        "choose measures the team can act on",
        "treat a quality drop as the stronger signal"
      ]
    }
  ]
};
