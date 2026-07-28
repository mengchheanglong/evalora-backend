import type { PrebuiltModuleDefinition } from "../types";

export const softwareCommunicationModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-se-communication",
  "type": "communication",
  "title": "Engineering Communication",
  "description": "Checks ability to explain risk, review code constructively, write incident updates, and collaborate with non-technical stakeholders.",
  "weight": 1.0,
  "orderIndex": 5,
  "settings": {
    "recommendedMinutes": 12
  },
  "questions": [
    {
      "id": "prebuilt-se-communication-risk-update",
      "questionText": "Explain a technical delay to a product manager in a way that is honest, concise, and includes recovery options.",
      "questionType": "roleplay",
      "rubric": [
        "lead with the delay and the new date",
        "skip jargon the reader cannot act on",
        "state what the delay costs the product",
        "offer options rather than only the problem"
      ]
    },
    {
      "id": "prebuilt-se-communication-pr-review",
      "questionText": "Write a pull request review comment for code that works but is hard to maintain. Be direct and respectful.",
      "questionType": "short_answer",
      "rubric": [
        "point at specific lines, not the person",
        "say why the code will be hard to change",
        "suggest a concrete alternative",
        "separate blocking comments from optional ones"
      ]
    },
    {
      "id": "prebuilt-se-communication-incident",
      "questionText": "Write a short incident update for non-technical stakeholders after a partial outage.",
      "questionType": "short_answer",
      "rubric": [
        "describe the outage without technical jargon",
        "say who was affected and for how long",
        "give the time of the next update",
        "own the problem rather than assign blame"
      ]
    },
    {
      "id": "prebuilt-se-communication-disagreement",
      "questionText": "You disagree with a senior engineer's design. How do you raise your concern productively?",
      "questionType": "roleplay",
      "rubric": [
        "bring data or a failing case, not opinion",
        "ask what the design is optimising for",
        "frame it as a trade-off, not a mistake",
        "accept the outcome once the call is made"
      ]
    },
    {
      "id": "prebuilt-se-communication-handoff",
      "questionText": "What information should be included when handing off an unfinished technical task to another engineer?",
      "questionType": "short_answer",
      "rubric": [
        "explain why the task exists",
        "say exactly what is done and not done",
        "list the traps the next person will hit",
        "name the clear next action",
        "state which tests pass and which do not"
      ]
    }
  ]
};
