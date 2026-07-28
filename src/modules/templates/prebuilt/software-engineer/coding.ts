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
      "questionText": "Read a line of space-separated integers and print them sorted in ascending order, space-separated.",
      "questionType": "coding",
      "options": {
        "codeQuestionId": "sort-ascending",
        "language": "typescript"
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
      "questionText": "Read a string (ignoring spaces) and print the character that appears most often. If several tie, print the alphabetically smallest.",
      "questionType": "coding",
      "options": {
        "codeQuestionId": "most-frequent-char",
        "language": "typescript"
      },
      "rubric": [
        "correctness",
        "edge cases",
        "readability",
        "complexity"
      ]
    },
    {
      "id": "prebuilt-se-coding-availability",
      "questionText": "Read a string of brackets ( ) [ ] { } and print \"Yes\" if they are balanced and correctly nested, otherwise \"No\".",
      "questionType": "coding",
      "options": {
        "codeQuestionId": "balanced-parentheses",
        "language": "typescript"
      },
      "rubric": [
        "correctness",
        "edge cases",
        "readability",
        "complexity"
      ]
    },
    {
      "id": "prebuilt-se-coding-validation",
      "questionText": "Read a word and print \"Yes\" if it reads the same forwards and backwards, otherwise \"No\".",
      "questionType": "coding",
      "options": {
        "codeQuestionId": "palindrome",
        "language": "typescript"
      },
      "rubric": [
        "correctness",
        "edge cases",
        "readability",
        "complexity"
      ]
    },
    {
      "id": "prebuilt-se-coding-transform",
      "questionText": "Read a line of space-separated integers and print the second largest distinct value.",
      "questionType": "coding",
      "options": {
        "codeQuestionId": "second-largest"
      },
      "rubric": [
        "correctness",
        "edge cases",
        "readability",
        "complexity"
      ]
    },
    {
      "id": "prebuilt-se-coding-cache",
      "questionText": "Line 1 is the target. Line 2 is an array of space-separated integers. Print the two 0-based indices of the numbers that add up to the target. Exactly one solution exists.",
      "questionType": "coding",
      "options": {
        "codeQuestionId": "two-sum",
        "language": "typescript"
      },
      "rubric": [
        "correctness",
        "edge cases",
        "readability",
        "complexity"
      ]
    }
  ]
};
