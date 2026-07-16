import type { PrebuiltAssessmentTemplateDefinition, PrebuiltModuleDefinition } from "../types";

const communication: PrebuiltModuleDefinition = {
  id: "prebuilt-cs-communication",
  type: "communication",
  title: "Customer Communication",
  description: "Clear, calm, professional writing and conversation under pressure.",
  weight: 1.35,
  orderIndex: 1,
  settings: { recommendedMinutes: 14 },
  questions: [
    {
      id: "prebuilt-cs-comm-escalation",
      questionText: "A customer is frustrated because three previous support tickets did not solve their issue. Write your first reply email to rebuild trust and explain the next steps.",
      questionType: "roleplay",
      rubric: ["empathy", "clarity", "ownership", "next-steps"],
    },
    {
      id: "prebuilt-cs-comm-internal",
      questionText: "Write an internal handoff note to Engineering about a recurring product bug affecting a key account.",
      questionType: "roleplay",
      rubric: ["structure", "impact", "repro-detail", "priority"],
    },
    {
      id: "prebuilt-cs-comm-hard-news",
      questionText: "You must tell a customer their requested feature will not ship this quarter. How do you communicate it?",
      questionType: "scenario",
      rubric: ["honesty", "relationship", "alternatives", "professionalism"],
    },
    {
      id: "prebuilt-cs-comm-call",
      questionText: "Outline the agenda for a 30-minute QBR with a mid-market customer whose usage is declining.",
      questionType: "short_answer",
      rubric: ["structure", "value", "discovery", "action-planning"],
    },
  ],
};

const problemSolving: PrebuiltModuleDefinition = {
  id: "prebuilt-cs-problem-solving",
  type: "problem_solving",
  title: "Account Problem Solving",
  description: "Diagnosing churn risk, adoption gaps, and multi-stakeholder issues.",
  weight: 1.25,
  orderIndex: 2,
  settings: { recommendedMinutes: 14 },
  questions: [
    {
      id: "prebuilt-cs-ps-churn",
      questionText: "Usage dropped 40% for a renewing account. What is your 48-hour action plan?",
      questionType: "scenario",
      rubric: ["urgency", "diagnosis", "stakeholder-map", "playbook"],
    },
    {
      id: "prebuilt-cs-ps-adoption",
      questionText: "Only one team at a customer uses your product. How would you expand adoption ethically?",
      questionType: "scenario",
      rubric: ["expansion", "value", "change-management", "relationship"],
    },
    {
      id: "prebuilt-cs-ps-priority",
      questionText: "You have five accounts needing attention today. How do you prioritize?",
      questionType: "short_answer",
      rubric: ["prioritization", "risk", "commercial-awareness", "time-management"],
    },
    {
      id: "prebuilt-cs-ps-root-cause",
      questionText: "Customers keep asking for training on the same feature. What does that tell you and what would you do?",
      questionType: "scenario",
      rubric: ["pattern-recognition", "product-feedback", "enablement", "systems-thinking"],
    },
  ],
};

const behavioral: PrebuiltModuleDefinition = {
  id: "prebuilt-cs-behavioral",
  type: "behavioral",
  title: "Behavioral Evidence",
  description: "Past customer outcomes, resilience, and collaboration with Sales/Product.",
  weight: 1.1,
  orderIndex: 3,
  settings: { recommendedMinutes: 12 },
  questions: [
    {
      id: "prebuilt-cs-beh-save",
      questionText: "Tell us about a time you saved an at-risk customer relationship. What actions did you take and what was the result?",
      questionType: "short_answer",
      rubric: ["ownership", "empathy", "execution", "outcome"],
    },
    {
      id: "prebuilt-cs-beh-conflict",
      questionText: "Describe a disagreement with Sales about a customer commitment. How was it resolved?",
      questionType: "short_answer",
      rubric: ["collaboration", "boundaries", "customer-advocacy", "professionalism"],
    },
    {
      id: "prebuilt-cs-beh-feedback",
      questionText: "Share a time you translated customer feedback into a product change or process fix.",
      questionType: "short_answer",
      rubric: ["advocacy", "influence", "systems", "impact"],
    },
    {
      id: "prebuilt-cs-beh-mistake",
      questionText: "Tell us about a customer-facing mistake you made. How did you recover trust?",
      questionType: "short_answer",
      rubric: ["accountability", "recovery", "communication", "learning"],
    },
  ],
};

const leadership: PrebuiltModuleDefinition = {
  id: "prebuilt-cs-leadership",
  type: "leadership",
  title: "Customer Leadership",
  description: "Guiding accounts, setting expectations, and coordinating internal teams.",
  weight: 1.05,
  orderIndex: 4,
  settings: { recommendedMinutes: 10 },
  questions: [
    {
      id: "prebuilt-cs-lead-multi",
      questionText: "Two stakeholders at a customer disagree on success criteria. How do you lead alignment?",
      questionType: "scenario",
      rubric: ["facilitation", "clarity", "diplomacy", "outcomes"],
    },
    {
      id: "prebuilt-cs-lead-escalation",
      questionText: "When do you escalate an account issue to leadership, and what package of context do you bring?",
      questionType: "short_answer",
      rubric: ["judgment", "escalation", "context", "solutions"],
    },
    {
      id: "prebuilt-cs-lead-playbook",
      questionText: "How would you design an onboarding playbook for a new mid-market segment?",
      questionType: "scenario",
      rubric: ["process-design", "customer-journey", "scalability", "measurement"],
    },
  ],
};

const workStyle: PrebuiltModuleDefinition = {
  id: "prebuilt-cs-work-style",
  type: "work_style",
  title: "Work Style",
  description: "CRM hygiene, proactive outreach, and service orientation.",
  weight: 0.9,
  orderIndex: 5,
  settings: { recommendedMinutes: 8 },
  questions: [
    {
      id: "prebuilt-cs-ws-crm",
      questionText: "How strongly do you prefer updating CRM notes the same day as every customer interaction?",
      questionType: "scale",
      options: ["1 - Rarely", "2", "3 - Sometimes", "4", "5 - Always"],
      rubric: ["discipline", "team-enablement", "continuity"],
    },
    {
      id: "prebuilt-cs-ws-proactive",
      questionText: "How strongly do you prefer proactive check-ins even when there is no open ticket?",
      questionType: "scale",
      options: ["1 - Reactive", "2", "3 - Balanced", "4", "5 - Highly proactive"],
      rubric: ["proactivity", "relationship", "retention"],
    },
    {
      id: "prebuilt-cs-ws-tools",
      questionText: "Which signals do you monitor weekly to catch churn risk early?",
      questionType: "short_answer",
      rubric: ["metrics-awareness", "proactivity", "systems"],
    },
  ],
};

const aiInterview: PrebuiltModuleDefinition = {
  id: "prebuilt-cs-ai-interview",
  type: "ai_interview",
  title: "Customer Success Interview",
  description: "Open-ended account strategy and AI-assisted support judgment.",
  weight: 1.05,
  orderIndex: 6,
  settings: { recommendedMinutes: 12, allowFollowUps: true },
  questions: [
    {
      id: "prebuilt-cs-ai-first-90",
      questionText: "What would your first 90 days look like owning a book of 40 mid-market accounts?",
      questionType: "scenario",
      rubric: ["planning", "prioritization", "relationship", "measurement"],
    },
    {
      id: "prebuilt-cs-ai-health",
      questionText: "Design a simple customer health score. Which inputs matter and which should you ignore?",
      questionType: "scenario",
      rubric: ["metrics", "judgment", "simplicity", "actionability"],
    },
    {
      id: "prebuilt-cs-ai-tools",
      questionText: "When is it appropriate to use AI-generated customer emails, and what review bar would you set?",
      questionType: "scenario",
      rubric: ["ai-judgment", "tone", "risk", "ownership"],
    },
  ],
};

export const customerSuccessTemplate: PrebuiltAssessmentTemplateDefinition = {
  id: "prebuilt-customer-success-assessment",
  title: "Customer Success Assessment",
  description:
    "Customer communication, churn risk handling, account problem solving, cross-functional coordination, and relationship ownership for CS screens.",
  roleType: "Customer Success",
  timeLimitMin: 65,
  scoringRules: {
    passScore: 3.5,
    scale: "1-5",
    source: "prebuilt-researched-v2",
    recommendedCandidateQuestionCount: { min: 9, max: 13 },
    notes: "Emphasize written communication and practical account scenarios.",
  },
  modules: [communication, problemSolving, behavioral, leadership, workStyle, aiInterview],
};
