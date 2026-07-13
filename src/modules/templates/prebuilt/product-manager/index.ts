import type { PrebuiltAssessmentTemplateDefinition, PrebuiltModuleDefinition } from "../types";

const problemSolving: PrebuiltModuleDefinition = {
  id: "prebuilt-pm-problem-solving",
  type: "problem_solving",
  title: "Product Judgment",
  description: "Ambiguous product scenarios, prioritization, and evidence-based decision making.",
  weight: 1.4,
  orderIndex: 1,
  settings: { recommendedMinutes: 16 },
  questions: [
    {
      id: "prebuilt-pm-ps-activation",
      questionText: "A key activation metric drops 18% after a release. How would you investigate and decide what to do next?",
      questionType: "scenario",
      rubric: ["structured-investigation", "hypothesis-driven", "metrics", "decision-quality"],
    },
    {
      id: "prebuilt-pm-ps-roadmap",
      questionText: "Engineering can only ship one of three competing features this quarter. How would you choose?",
      questionType: "scenario",
      rubric: ["prioritization", "trade-offs", "customer-impact", "stakeholder-alignment"],
    },
    {
      id: "prebuilt-pm-ps-scope",
      questionText: "Sales asks for a custom enterprise feature that would delay the public roadmap. How do you respond?",
      questionType: "scenario",
      rubric: ["scope-control", "commercial-awareness", "communication", "principles"],
    },
    {
      id: "prebuilt-pm-ps-mvp",
      questionText: "Describe how you would define an MVP for a vague internal request that has no clear success metric.",
      questionType: "short_answer",
      rubric: ["problem-framing", "mvp-thinking", "measurement", "iteration"],
    },
    {
      id: "prebuilt-pm-ps-failure",
      questionText: "Tell us about a product decision that failed. What signals did you miss and what changed afterward?",
      questionType: "short_answer",
      rubric: ["reflection", "learning", "evidence", "accountability"],
    },
  ],
};

const communication: PrebuiltModuleDefinition = {
  id: "prebuilt-pm-communication",
  type: "communication",
  title: "Stakeholder Communication",
  description: "Executive updates, alignment writing, and clear product storytelling.",
  weight: 1.2,
  orderIndex: 2,
  settings: { recommendedMinutes: 12 },
  questions: [
    {
      id: "prebuilt-pm-comm-delay",
      questionText: "Write a short leadership update explaining a delayed launch, impact, recovery plan, and next milestone.",
      questionType: "roleplay",
      rubric: ["clarity", "ownership", "structure", "audience-fit"],
    },
    {
      id: "prebuilt-pm-comm-tradeoff",
      questionText: "Explain a hard product trade-off to non-technical stakeholders without oversimplifying the risk.",
      questionType: "roleplay",
      rubric: ["clarity", "risk-communication", "persuasion", "honesty"],
    },
    {
      id: "prebuilt-pm-comm-conflict",
      questionText: "Design and Engineering disagree on scope. How would you facilitate alignment in the next meeting?",
      questionType: "scenario",
      rubric: ["facilitation", "listening", "decision-framing", "collaboration"],
    },
    {
      id: "prebuilt-pm-comm-prfaq",
      questionText: "Draft 4 bullets a customer would see on a landing page for a feature you recently shipped or would ship.",
      questionType: "short_answer",
      rubric: ["customer-voice", "value-proposition", "concision", "outcomes"],
    },
  ],
};

const leadership: PrebuiltModuleDefinition = {
  id: "prebuilt-pm-leadership",
  type: "leadership",
  title: "Cross-functional Leadership",
  description: "Influence without authority, prioritization under pressure, and team outcomes.",
  weight: 1.15,
  orderIndex: 3,
  settings: { recommendedMinutes: 12 },
  questions: [
    {
      id: "prebuilt-pm-lead-influence",
      questionText: "You need Engineering buy-in for a risky bet with weak early data. How do you lead the decision?",
      questionType: "scenario",
      rubric: ["influence", "evidence", "risk-management", "trust"],
    },
    {
      id: "prebuilt-pm-lead-priority",
      questionText: "Two senior stakeholders push conflicting priorities. How do you move the team toward one decision?",
      questionType: "scenario",
      rubric: ["conflict-handling", "prioritization", "stakeholder-management", "clarity"],
    },
    {
      id: "prebuilt-pm-lead-ownership",
      questionText: "Describe a time you owned an outcome that spanned multiple teams. What did you own end-to-end?",
      questionType: "short_answer",
      rubric: ["ownership", "cross-functional", "delivery", "impact"],
    },
    {
      id: "prebuilt-pm-lead-ethics",
      questionText: "Growth asks for a dark pattern that would boost conversion. How do you handle it?",
      questionType: "scenario",
      rubric: ["ethics", "user-trust", "business-judgment", "courage"],
    },
  ],
};

const behavioral: PrebuiltModuleDefinition = {
  id: "prebuilt-pm-behavioral",
  type: "behavioral",
  title: "Behavioral Evidence",
  description: "Past product work, collaboration style, and learning under ambiguity.",
  weight: 1.05,
  orderIndex: 4,
  settings: { recommendedMinutes: 12 },
  questions: [
    {
      id: "prebuilt-pm-beh-story",
      questionText: "Walk through a product you owned from discovery to launch. What decisions mattered most?",
      questionType: "short_answer",
      rubric: ["ownership", "structure", "outcomes", "judgment"],
    },
    {
      id: "prebuilt-pm-beh-feedback",
      questionText: "Tell us about critical feedback you received on a product decision. What did you change?",
      questionType: "short_answer",
      rubric: ["humility", "learning", "adaptation", "collaboration"],
    },
    {
      id: "prebuilt-pm-beh-customer",
      questionText: "Describe a time customer research changed your roadmap. What evidence convinced you?",
      questionType: "short_answer",
      rubric: ["customer-focus", "evidence", "prioritization", "impact"],
    },
    {
      id: "prebuilt-pm-beh-ambiguity",
      questionText: "Share a time you had to make a call with incomplete information. How did you de-risk it?",
      questionType: "short_answer",
      rubric: ["judgment", "risk", "speed", "learning-loops"],
    },
  ],
};

const workStyle: PrebuiltModuleDefinition = {
  id: "prebuilt-pm-work-style",
  type: "work_style",
  title: "Work Style",
  description: "Collaboration preferences, ownership style, and operating rhythm.",
  weight: 0.9,
  orderIndex: 5,
  settings: { recommendedMinutes: 8 },
  questions: [
    {
      id: "prebuilt-pm-ws-clarity",
      questionText: "How strongly do you prefer written decision records before committing Engineering capacity?",
      questionType: "scale",
      options: ["1 - Rarely", "2", "3 - Sometimes", "4", "5 - Always"],
      rubric: ["process", "clarity", "collaboration"],
    },
    {
      id: "prebuilt-pm-ws-data",
      questionText: "How strongly do you prefer quantitative evidence before qualitative customer stories when prioritizing?",
      questionType: "scale",
      options: ["1 - Stories first", "2", "3 - Balanced", "4", "5 - Metrics first"],
      rubric: ["decision-style", "evidence", "balance"],
    },
    {
      id: "prebuilt-pm-ws-meetings",
      questionText: "Describe your ideal weekly operating cadence with Design, Engineering, and Go-to-market.",
      questionType: "short_answer",
      rubric: ["operating-rhythm", "collaboration", "focus"],
    },
  ],
};

const aiInterview: PrebuiltModuleDefinition = {
  id: "prebuilt-pm-ai-interview",
  type: "ai_interview",
  title: "AI Product Interview",
  description: "Adaptive product discussion prompts for open-ended judgment.",
  weight: 1.1,
  orderIndex: 6,
  settings: { recommendedMinutes: 14, allowFollowUps: true },
  questions: [
    {
      id: "prebuilt-pm-ai-strategy",
      questionText: "If you joined our product team tomorrow, what would you learn in the first two weeks and why?",
      questionType: "scenario",
      rubric: ["curiosity", "structure", "prioritization", "customer-focus"],
    },
    {
      id: "prebuilt-pm-ai-metric",
      questionText: "Pick a product you know well. Which one metric would you optimize and which metrics would you refuse to sacrifice?",
      questionType: "scenario",
      rubric: ["metrics", "trade-offs", "product-sense", "judgment"],
    },
    {
      id: "prebuilt-pm-ai-ai-feature",
      questionText: "How would you evaluate whether an AI feature is ready for GA versus remaining experimental?",
      questionType: "scenario",
      rubric: ["ai-literacy", "quality-bars", "risk", "measurement"],
    },
  ],
};

export const productManagerTemplate: PrebuiltAssessmentTemplateDefinition = {
  id: "prebuilt-product-manager-assessment",
  title: "Product Manager Assessment",
  description:
    "Product judgment, prioritization, stakeholder communication, cross-functional leadership, and evidence-based decision making for PM screens.",
  roleType: "Product Manager",
  timeLimitMin: 75,
  scoringRules: {
    passScore: 3.5,
    scale: "1-5",
    source: "prebuilt-researched-v2",
    recommendedCandidateQuestionCount: { min: 10, max: 14 },
    notes: "Assign a balanced subset across judgment, communication, and behavioral evidence.",
  },
  modules: [problemSolving, communication, leadership, behavioral, workStyle, aiInterview],
};
