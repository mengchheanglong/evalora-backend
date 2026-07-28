import type { PrebuiltAssessmentTemplateDefinition, PrebuiltModuleDefinition } from "../types";

const problemSolving: PrebuiltModuleDefinition = {
  id: "prebuilt-pm-problem-solving",
  type: "problem_solving",
  title: "Product Judgment",
  description: "Ambiguous product scenarios, prioritization, and evidence-based decision making.",
  weight: 1.4,
  orderIndex: 1,
  settings: { recommendedMinutes: 18 },
  questions: [
    {
      id: "prebuilt-pm-ps-activation",
      questionText: "A key activation metric drops 18% after a release. Walk through how you would investigate the cause and decide what to do next.",
      questionType: "scenario",
      rubric: ["structured-investigation", "hypothesis-driven", "metrics", "decision-quality"],
    },
    {
      id: "prebuilt-pm-ps-roadmap",
      questionText:
        "Engineering can only deliver ONE of three high-priority features this quarter: (1) a performance improvement requested by your top 10% of users, (2) a new integration Sales needs to close an enterprise deal, or (3) a mobile onboarding redesign. Walk through the decision framework you would use to choose.",
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
      id: "prebuilt-pm-ps-adoption",
      questionText:
        "A feature you launched shows 60% adoption but only 15% weekly active usage. How do you diagnose the gap between people trying it and sticking with it, and what actions would you take?",
      questionType: "scenario",
      rubric: ["diagnosis", "engagement-metrics", "root-cause", "action-plan"],
    },
    {
      id: "prebuilt-pm-ps-failure",
      questionText:
        "Describe a product decision that did not achieve the outcome you expected. What assumptions did you make, what data or signals did you miss, and what would you do differently now?",
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
  settings: { recommendedMinutes: 14 },
  questions: [
    {
      id: "prebuilt-pm-comm-delay",
      questionText:
        "Write a leadership update explaining a six-week delay to a critical launch. Cover the impact, your recovery plan, revised milestones, and how you will rebuild stakeholder confidence.",
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
      questionText:
        "Draft four customer-facing landing-page bullets for a feature you would ship. Cover the problem it solves, the key benefit, how it works in plain terms, and a clear call to action. Keep each bullet under 15 words.",
      questionType: "short_answer",
      rubric: ["customer-voice", "value-proposition", "concision", "outcomes"],
    },
    {
      id: "prebuilt-pm-comm-sponsor",
      questionText:
        "An executive sponsor with significant political power is pushing hard for a feature you believe is the wrong priority. Write how you would handle that conversation.",
      questionType: "roleplay",
      rubric: ["influence", "candor", "managing-up", "data-driven"],
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
  settings: { recommendedMinutes: 14 },
  questions: [
    {
      id: "prebuilt-pm-lead-influence",
      questionText: "You need Engineering buy-in for a risky bet with weak early data. How do you lead the decision?",
      questionType: "scenario",
      rubric: ["influence", "evidence", "risk-management", "trust"],
    },
    {
      id: "prebuilt-pm-lead-priority",
      questionText:
        "The VP of Sales wants custom enterprise features this quarter while the VP of Engineering wants to focus on technical debt. Both are pushing hard. How do you move the organization toward one aligned priority?",
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
      questionText:
        "The Growth team proposes urgency tactics ('Only 2 left!') and pre-checked opt-in boxes to lift conversion by an estimated 25%. You are concerned about user trust and long-term brand. What is your recommendation and how do you communicate it?",
      questionType: "scenario",
      rubric: ["ethics", "user-trust", "business-judgment", "courage"],
    },
    {
      id: "prebuilt-pm-lead-capacity",
      questionText:
        "You need Engineering to prioritize your initiative, but they are at full capacity on infrastructure work and you have no authority over them. How do you approach it, and what is your strategy?",
      questionType: "scenario",
      rubric: ["influence-without-authority", "negotiation", "prioritization", "collaboration"],
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
      questionText:
        "Walk through a product you owned from discovery to launch. Address how you identified the problem, what alternatives you considered, the hardest decision you made, and how you measured the outcome.",
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
      questionText:
        "Describe a time customer research or data contradicted your initial hypothesis or roadmap. What was the evidence, how did you evaluate it, and how did you communicate the change?",
      questionType: "short_answer",
      rubric: ["customer-focus", "evidence", "prioritization", "impact"],
    },
    {
      id: "prebuilt-pm-beh-ambiguity",
      questionText:
        "Share a time you had to make a product call with incomplete or ambiguous data. What information did you have, what assumptions did you make, how did you de-risk it, and what was the outcome?",
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
  settings: { recommendedMinutes: 10 },
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
      id: "prebuilt-pm-ws-feasibility",
      questionText: "When you disagree with Engineering about technical feasibility versus product requirements, how do you usually resolve it?",
      questionType: "scale",
      options: ["1 - Defer to Engineering", "2 - Gather more data first", "3 - Facilitate a structured discussion", "4 - Escalate to leadership", "5 - Make the final PM call"],
      rubric: ["decision-style", "collaboration", "conflict-handling"],
    },
    {
      id: "prebuilt-pm-ws-meetings",
      questionText: "Describe your ideal weekly operating cadence with Design, Engineering, and Go-to-market.",
      questionType: "short_answer",
      rubric: ["operating-rhythm", "collaboration", "focus"],
    },
    {
      id: "prebuilt-pm-ws-weighting",
      questionText:
        "When you prioritize your roadmap, how do you weigh customer requests, business/revenue impact, technical debt, and strategic vision against each other? Explain your approach.",
      questionType: "short_answer",
      rubric: ["prioritization", "balance", "strategy", "transparency"],
    },
    {
      id: "prebuilt-pm-ws-no",
      questionText: "Describe your approach to saying 'no' to stakeholder requests, with an example of how you handled it.",
      questionType: "short_answer",
      rubric: ["boundary-setting", "communication", "prioritization", "relationship"],
    },
  ],
};

const aiInterview: PrebuiltModuleDefinition = {
  id: "prebuilt-pm-ai-interview",
  type: "ai_interview",
  title: "AI Product Interview",
  description: "Adaptive product discussion prompts. These seed an interview that adapts to the candidate's earlier answers.",
  weight: 1.1,
  orderIndex: 6,
  settings: { recommendedMinutes: 14, allowFollowUps: true },
  questions: [
    {
      id: "prebuilt-pm-ai-strategy",
      questionText:
        "If you joined our product team tomorrow, outline your 30-60-90 day plan: what you would learn in the first two weeks, who you would talk to, what data and metrics you would analyze, and your priorities for each phase.",
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
      questionText:
        "You are launching an AI-powered feature such as smart reply suggestions. How would you decide it is ready for general availability versus staying in beta — what quality thresholds, success metrics, and risks would you weigh?",
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
  timeLimitMin: 80,
  scoringRules: {
    passScore: 3.5,
    scale: "1-5",
    source: "prebuilt-researched-v2",
    recommendedCandidateQuestionCount: { min: 12, max: 16 },
    notes: "Assign a balanced subset across judgment, communication, leadership, and behavioral evidence.",
  },
  modules: [problemSolving, communication, leadership, behavioral, workStyle, aiInterview],
};
