import type { PrebuiltModuleDefinition } from "../types";

export const softwareSystemDesignModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-se-system-design",
  "type": "problem_solving",
  "title": "System Design and Architecture",
  "description": "Tests design clarity, trade-offs, scalability, reliability, and product constraints.",
  "weight": 1.35,
  "orderIndex": 4,
  "settings": {
    "recommendedMinutes": 18
  },
  "questions": [
    {
      "id": "prebuilt-se-design-notifications",
      "questionText": "Design a notification system that sends interview reminders to tens of thousands of candidates. Cover the data model, delivery reliability, retries, and failure handling.",
      "questionType": "scenario",
      "rubric": [
        "ask what volume, timing, and channels are needed",
        "sketch the tables and how they relate",
        "handle retries and duplicate sends",
        "explain what is traded away for throughput",
        "describe how it grows past one worker"
      ]
    },
    {
      "id": "prebuilt-se-design-permissions",
      "questionText": "Design a permission model for admin, organization, interviewer, and candidate users in an assessment platform.",
      "questionType": "scenario",
      "rubric": [
        "map each role to the actions it may take",
        "state who owns each record",
        "deny by default rather than allow",
        "cover users holding more than one role",
        "keep the model simple enough to reason about"
      ]
    },
    {
      "id": "prebuilt-se-design-file-upload",
      "questionText": "How would you design a secure file upload flow for candidate attachments or portfolios?",
      "questionType": "scenario",
      "rubric": [
        "check file type and size before storing",
        "store outside the web root with signed access",
        "scan or sandbox untrusted content",
        "limit who can read a candidate's file",
        "handle partial or failed uploads"
      ]
    },
    {
      "id": "prebuilt-se-design-migration",
      "questionText": "You need to migrate question data without downtime. What plan would you propose?",
      "questionType": "scenario",
      "rubric": [
        "add the new shape before removing the old",
        "keep both shapes readable during the change",
        "describe how to revert part way through",
        "compare row counts or checksums afterward"
      ]
    },
    {
      "id": "prebuilt-se-design-api-versioning",
      "questionText": "A frontend team needs a new API response shape, but existing clients depend on the old one. What options do you consider?",
      "questionType": "scenario",
      "rubric": [
        "keep the existing clients working",
        "name the versioning option chosen and why",
        "agree a removal date with the other team",
        "weigh the cost of maintaining two shapes"
      ]
    },
    {
      "id": "prebuilt-se-design-prioritization",
      "questionText": "A critical bug, security warning, and product deadline compete for attention. How would you prioritize and communicate the decision?",
      "questionType": "scenario",
      "rubric": [
        "rank by user harm and likelihood",
        "judge the security warning on its own merits",
        "state what delaying the deadline costs",
        "tell the affected people what was decided"
      ]
    }
  ]
};
