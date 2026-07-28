import type { PrebuiltModuleDefinition } from "../types";

export const softwareCodingModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-se-coding",
  "type": "coding",
  "title": "Coding Assessment",
  "description": "Checks practical implementation quality using submitted code, edge cases, and execution evidence.",
  "weight": 1.55,
  "orderIndex": 2,
  "settings": {
    "recommendedMinutes": 25,
    "language": "typescript",
    "executionRequired": true
  },
  "questions": [
    {
      "id": "prebuilt-se-coding-normalize-scores",
      "questionText": "Implement normalizeScores(scores) that accepts an array of numbers and returns values normalized from 0 to 100 while handling empty arrays, equal values, negative numbers, and invalid inputs.",
      "questionType": "coding",
      "options": {
        "language": "typescript",
        "examples": [
          "normalizeScores([10, 20, 30]) -> [0, 50, 100]",
          "normalizeScores([5, 5]) -> [100, 100]"
        ],
        "constraints": [
          "Do not mutate the input array",
          "Return [] for empty input",
          "Throw or clearly handle non-number values"
        ]
      },
      "rubric": [
        "correctness",
        "edge cases",
        "readability",
        "complexity",
        "test coverage"
      ]
    },
    {
      "id": "prebuilt-se-coding-frequency",
      "questionText": "Implement mostFrequentWord(text) that returns the most common normalized word while ignoring punctuation and handling ties deterministically.",
      "questionType": "coding",
      "options": {
        "language": "typescript",
        "constraints": [
          "Case-insensitive",
          "Ignore punctuation",
          "Document tie behavior"
        ]
      },
      "rubric": [
        "normalize case and strip punctuation",
        "handle empty text and a single word",
        "break ties by a stated rule",
        "use clear names and small functions",
        "show the cases the code was checked against"
      ]
    },
    {
      "id": "prebuilt-se-coding-availability",
      "questionText": "Implement hasScheduleConflict(intervals) to detect overlapping time ranges and explain its time complexity.",
      "questionType": "coding",
      "options": {
        "language": "typescript",
        "examples": [
          "[[9,10],[10,11]] -> false",
          "[[9,11],[10,12]] -> true"
        ]
      },
      "rubric": [
        "sort or scan the intervals in one pass",
        "detect overlap correctly, including touching ends",
        "state the time complexity and why",
        "handle empty and single-interval input"
      ]
    },
    {
      "id": "prebuilt-se-coding-validation",
      "questionText": "Write a validateAssessmentPayload(payload) function that checks required template, module, and question fields without mutating input.",
      "questionType": "coding",
      "options": {
        "language": "typescript"
      },
      "rubric": [
        "check every required field and its type",
        "return a clear error naming the bad field",
        "leave the incoming payload unmutated",
        "keep the rules readable as fields change",
        "show the invalid payloads tested"
      ]
    },
    {
      "id": "prebuilt-se-coding-transform",
      "questionText": "Transform a flat list of question rows into modules with ordered questions. Explain how you handle missing modules or duplicate order indexes.",
      "questionType": "coding",
      "rubric": [
        "group rows into modules without losing any",
        "handle a missing or unknown module",
        "produce a stable order for duplicate indexes",
        "explain the chosen behaviour in the code"
      ]
    },
    {
      "id": "prebuilt-se-coding-cache",
      "questionText": "Implement a simple in-memory cache with get, set, and TTL expiration. Describe one limitation of this design.",
      "questionType": "coding",
      "options": {
        "language": "typescript"
      },
      "rubric": [
        "get and set return the expected values",
        "expire entries once the ttl has passed",
        "keep the implementation small and readable",
        "name a limitation such as unbounded memory",
        "show the expiry cases tested"
      ]
    }
  ]
};
