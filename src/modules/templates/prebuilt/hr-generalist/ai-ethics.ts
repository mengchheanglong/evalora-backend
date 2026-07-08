import type { PrebuiltModuleDefinition } from "../types";

export const hrAiEthicsModule: PrebuiltModuleDefinition = {
  "id": "prebuilt-hr-ai-ethics",
  "type": "ai_interview",
  "title": "HR Case and Ethics Interview",
  "description": "Modern HR case questions covering structured investigation, AI tool use, employee advocacy, and evidence-based recommendations.",
  "weight": 1.0,
  "orderIndex": 6,
  "settings": {
    "recommendedMinutes": 12,
    "allowFollowUps": true
  },
  "questions": [
    {
      "id": "prebuilt-hr-ai-ethics-investigation",
      "questionText": "Design a fair intake process for an employee relations complaint. What information do you collect and what do you avoid promising?",
      "questionType": "scenario",
      "rubric": [
        "structured-intake",
        "fairness",
        "confidentiality",
        "scope-control",
        "documentation"
      ]
    },
    {
      "id": "prebuilt-hr-ai-ethics-resume-ai",
      "questionText": "If an AI tool ranks resumes for a role, what risks would you check before trusting the shortlist?",
      "questionType": "scenario",
      "rubric": [
        "bias-awareness",
        "human-review",
        "job-relevance",
        "auditability",
        "compliance-risk"
      ]
    },
    {
      "id": "prebuilt-hr-ai-ethics-advocacy",
      "questionText": "How do you balance being approachable to employees with protecting company policy and legal risk?",
      "questionType": "short_answer",
      "rubric": [
        "balanced-judgment",
        "trust",
        "boundaries",
        "policy-awareness"
      ]
    },
    {
      "id": "prebuilt-hr-ai-ethics-survey",
      "questionText": "An engagement survey shows low trust in management. What follow-up questions and data would you gather before recommending action?",
      "questionType": "scenario",
      "rubric": [
        "data-triangulation",
        "employee-voice",
        "manager-context",
        "actionability",
        "measurement"
      ]
    },
    {
      "id": "prebuilt-hr-ai-ethics-confidential-ai",
      "questionText": "A manager wants to paste employee complaint details into a public AI chatbot to draft a response. What guidance do you give?",
      "questionType": "scenario",
      "rubric": [
        "privacy",
        "ai-risk-awareness",
        "safe-alternatives",
        "manager-coaching"
      ]
    }
  ]
};
