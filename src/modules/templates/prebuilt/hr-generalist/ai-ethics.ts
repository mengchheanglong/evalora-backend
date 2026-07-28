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
        "use the same intake questions every time",
        "gather facts before forming a view",
        "say who will see what is shared",
        "avoid promising an outcome or total secrecy",
        "write the account down at the time"
      ]
    },
    {
      "id": "prebuilt-hr-ai-ethics-resume-ai",
      "questionText": "If an AI tool ranks resumes for a role, what risks would you check before trusting the shortlist?",
      "questionType": "scenario",
      "rubric": [
        "ask what the model learned to favour",
        "keep a person deciding the shortlist",
        "check the criteria relate to the job",
        "require an explanation for each ranking",
        "name the discrimination risk of trusting it blind"
      ]
    },
    {
      "id": "prebuilt-hr-ai-ethics-advocacy",
      "questionText": "How do you balance being approachable to employees with protecting company policy and legal risk?",
      "questionType": "short_answer",
      "rubric": [
        "be honest about what stays confidential",
        "listen without promising a result",
        "say where the employer's interest applies",
        "apply policy without hiding behind it"
      ]
    },
    {
      "id": "prebuilt-hr-ai-ethics-survey",
      "questionText": "An engagement survey shows low trust in management. What follow-up questions and data would you gather before recommending action?",
      "questionType": "scenario",
      "rubric": [
        "compare the survey with turnover and exits",
        "ask employees what the scores mean",
        "hear the manager's side before acting",
        "recommend changes someone can own",
        "agree how improvement will be measured"
      ]
    },
    {
      "id": "prebuilt-hr-ai-ethics-confidential-ai",
      "questionText": "A manager wants to paste employee complaint details into a public AI chatbot to draft a response. What guidance do you give?",
      "questionType": "scenario",
      "rubric": [
        "stop personal details leaving the company",
        "explain that prompts may be stored or reused",
        "offer an approved tool or a template",
        "coach the manager instead of only refusing"
      ]
    }
  ]
};
