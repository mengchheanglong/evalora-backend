import type { PrebuiltModuleDefinition } from "../types";

export const softwareWorkStyleModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-se-work-style",
  "type": "work_style",
  "title": "Engineering Work Style",
  "description": "Explores testing habits, review discipline, AI tool boundaries, ambiguity handling, and team operating style.",
  "weight": 1.0,
  "orderIndex": 6,
  "settings": {
    "recommendedMinutes": 10
  },
  "questions": [
    {
      "id": "prebuilt-se-work-style-testing",
      "questionText": "How do you decide what to test before saying a feature is done?",
      "questionType": "short_answer",
      "rubric": [
        "choose tests by where the risk is",
        "cover empty, invalid, and boundary input",
        "say what they deliberately do not test",
        "state what done means for this feature"
      ]
    },
    {
      "id": "prebuilt-se-work-style-code-review",
      "questionText": "What do you look for when reviewing someone else's code beyond whether it works?",
      "questionType": "short_answer",
      "rubric": [
        "ask whether the next person can change it",
        "check input handling and exposed data",
        "question names that hide intent",
        "look for missing tests around new branches",
        "notice when the code belongs somewhere else"
      ]
    },
    {
      "id": "prebuilt-se-work-style-ambiguity",
      "questionText": "A ticket is unclear and the deadline is close. What do you do before starting implementation?",
      "questionType": "scenario",
      "rubric": [
        "ask the specific question that unblocks them",
        "agree the smallest useful scope",
        "flag the deadline risk early",
        "start on the part that is already clear"
      ]
    },
    {
      "id": "prebuilt-se-work-style-ai-boundaries",
      "questionText": "When is it appropriate to use AI while coding, and what work must remain your responsibility?",
      "questionType": "short_answer",
      "rubric": [
        "say where generated code is and is not safe",
        "read and test the output before using it",
        "take responsibility for the merged result",
        "keep secrets and customer data out of prompts"
      ]
    },
    {
      "id": "prebuilt-se-work-style-pairing",
      "questionText": "Describe your preferred way to pair-program or collaborate on a difficult bug.",
      "questionType": "short_answer",
      "rubric": [
        "agree who drives and who navigates",
        "think out loud while debugging",
        "treat the other person's idea as testable",
        "set a time box before regrouping"
      ]
    }
  ]
};
