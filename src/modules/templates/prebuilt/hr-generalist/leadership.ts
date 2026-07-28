import type { PrebuiltModuleDefinition } from "../types";

export const hrLeadershipModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-hr-leadership",
  "type": "leadership",
  "title": "Manager Advisory and Employee Relations Judgment",
  "description": "Assesses HR partnership with managers, conflict mediation, policy rollouts, and fair escalation decisions.",
  "weight": 1.15,
  "orderIndex": 5,
  "settings": {
    "recommendedMinutes": 14
  },
  "questions": [
    {
      "id": "prebuilt-hr-leadership-termination-pressure",
      "questionText": "A manager asks HR to terminate an employee immediately without documentation. What do you do?",
      "questionType": "scenario",
      "rubric": [
        "name the legal and unfair-dismissal risk",
        "explain the steps the policy requires",
        "give the manager a workable alternative",
        "hear the employee's side first",
        "escalate rather than proceed without records"
      ]
    },
    {
      "id": "prebuilt-hr-leadership-feedback-coaching",
      "questionText": "How would you coach a manager who gives vague negative feedback but expects HR to solve the performance issue?",
      "questionType": "scenario",
      "rubric": [
        "turn vague complaints into observed examples",
        "show the manager how to phrase it",
        "keep the performance conversation with the manager",
        "agree what gets written down and when",
        "make sure the employee hears it directly"
      ]
    },
    {
      "id": "prebuilt-hr-leadership-team-conflict",
      "questionText": "Two team members accuse each other of disrespectful behavior. What process would you follow before recommending action?",
      "questionType": "scenario",
      "rubric": [
        "avoid deciding before hearing both",
        "collect what was said, done, and witnessed",
        "limit who learns about the complaint",
        "reduce contact while it is investigated",
        "set out what happens at each outcome"
      ]
    },
    {
      "id": "prebuilt-hr-leadership-policy-rollout",
      "questionText": "You need to roll out a new attendance policy that managers support but employees may dislike. How would you communicate it?",
      "questionType": "short_answer",
      "rubric": [
        "explain the reason before the rule",
        "brief managers before the announcement",
        "acknowledge what employees will dislike",
        "apply the policy the same way everywhere"
      ]
    },
    {
      "id": "prebuilt-hr-leadership-complaint",
      "questionText": "An employee raises a complaint involving a senior manager. How do you protect fairness and trust in the process?",
      "questionType": "scenario",
      "rubric": [
        "keep the senior manager out of the process",
        "limit the details to those who must know",
        "escalate to someone with authority above them",
        "watch for retaliation against the complainant",
        "record each step and decision"
      ]
    }
  ]
};
