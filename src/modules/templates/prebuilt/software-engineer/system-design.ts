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
        "requirements-clarification",
        "data-modeling",
        "reliability",
        "trade-offs",
        "scalability"
      ]
    },
    {
      "id": "prebuilt-se-design-permissions",
      "questionText": "Design a permission model for admin, organization, interviewer, and candidate users in an assessment platform.",
      "questionType": "scenario",
      "rubric": [
        "rbac",
        "data-ownership",
        "security",
        "edge-cases",
        "simplicity"
      ]
    },
    {
      "id": "prebuilt-se-design-file-upload",
      "questionText": "How would you design a secure file upload flow for candidate attachments or portfolios?",
      "questionType": "scenario",
      "rubric": [
        "security",
        "storage-design",
        "validation",
        "privacy",
        "failure-handling"
      ]
    },
    {
      "id": "prebuilt-se-design-migration",
      "questionText": "You need to migrate question data without downtime. What plan would you propose?",
      "questionType": "scenario",
      "rubric": [
        "migration-strategy",
        "backward-compatibility",
        "rollback",
        "validation"
      ]
    },
    {
      "id": "prebuilt-se-design-api-versioning",
      "questionText": "A frontend team needs a new API response shape, but existing clients depend on the old one. What options do you consider?",
      "questionType": "scenario",
      "rubric": [
        "api-contracts",
        "compatibility",
        "stakeholder-coordination",
        "trade-offs"
      ]
    },
    {
      "id": "prebuilt-se-design-prioritization",
      "questionText": "A critical bug, security warning, and product deadline compete for attention. How would you prioritize and communicate the decision?",
      "questionType": "scenario",
      "rubric": [
        "risk-ranking",
        "security-awareness",
        "business-impact",
        "communication"
      ]
    }
  ]
};
