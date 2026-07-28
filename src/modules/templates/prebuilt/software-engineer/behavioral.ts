import type { PrebuiltModuleDefinition } from "../types";

export const softwareBehavioralModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-se-behavioral",
  "type": "behavioral",
  "title": "Engineering Behavioral Interview",
  "description": "Explores ownership, collaboration, failure recovery, learning velocity, and cross-functional product impact.",
  "weight": 1.05,
  "orderIndex": 7,
  "settings": {
    "recommendedMinutes": 12
  },
  "questions": [
    {
      "id": "prebuilt-se-behavioral-conflict",
      "questionText": "Tell us about a time you had a technical disagreement with a teammate. What changed your mind or theirs?",
      "questionType": "short_answer",
      "rubric": [
        "describe the other person's argument fairly",
        "bring data or a test that settled it",
        "admit which part they got wrong",
        "say what was decided and how it held up"
      ]
    },
    {
      "id": "prebuilt-se-behavioral-ownership",
      "questionText": "Describe a time you owned a problem beyond your assigned ticket. What was the outcome?",
      "questionType": "short_answer",
      "rubric": [
        "describe the problem nobody had picked up",
        "say what they did beyond the assigned ticket",
        "give the result in numbers or user terms",
        "describe how they saw it through to the end"
      ]
    },
    {
      "id": "prebuilt-se-behavioral-failure",
      "questionText": "Tell us about a feature or fix that did not work as expected. What did you learn?",
      "questionType": "short_answer",
      "rubric": [
        "say plainly what went wrong",
        "own their part without blaming others",
        "name the technical lesson learned",
        "describe the change that stops a repeat"
      ]
    },
    {
      "id": "prebuilt-se-behavioral-product",
      "questionText": "Give an example of when user or customer impact changed your technical approach.",
      "questionType": "short_answer",
      "rubric": [
        "describe what users actually needed",
        "say what the simpler approach gave up",
        "connect the technical choice to the outcome",
        "give evidence the change helped"
      ]
    },
    {
      "id": "prebuilt-se-behavioral-learning",
      "questionText": "How did you learn a new tool, framework, or codebase under time pressure?",
      "questionType": "short_answer",
      "rubric": [
        "describe how they got oriented quickly",
        "name the sources or people they used",
        "say what shipped despite the time pressure",
        "describe what they told the team along the way"
      ]
    }
  ]
};
