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
      rubric: [
        "acknowledge the frustration before explaining",
        "say plainly what went wrong",
        "take responsibility instead of blaming support",
        "commit to a specific next step and date",
      ],
    },
    {
      id: "prebuilt-cs-comm-internal",
      questionText: "Write an internal handoff note to Engineering about a recurring product bug affecting a key account.",
      questionType: "roleplay",
      rubric: [
        "lead with the account and what it is worth",
        "give the steps to reproduce it",
        "state how often it happens",
        "say what is blocked and how urgently",
      ],
    },
    {
      id: "prebuilt-cs-comm-hard-news",
      questionText: "You must tell a customer their requested feature will not ship this quarter. How do you communicate it?",
      questionType: "scenario",
      rubric: [
        "say it will not ship, without hedging",
        "explain the reason honestly",
        "offer a workaround or a revised timeline",
        "keep the relationship open for the next call",
      ],
    },
    {
      id: "prebuilt-cs-comm-call",
      questionText: "Outline the agenda for a 30-minute QBR with a mid-market customer whose usage is declining.",
      questionType: "short_answer",
      rubric: [
        "open with their goals, not your slides",
        "show the value already delivered",
        "ask why usage is falling",
        "close with owners and dates",
      ],
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
      rubric: [
        "reach the account within the first day",
        "check whether the usage or the people changed",
        "identify the champion and the budget holder",
        "set out the steps for the next two days",
      ],
    },
    {
      id: "prebuilt-cs-ps-adoption",
      questionText: "Only one team at a customer uses your product. How would you expand adoption ethically?",
      questionType: "scenario",
      rubric: [
        "find the outcome another team would gain",
        "use the existing team as proof",
        "plan enablement, not just an invitation",
        "get the sponsor to introduce you",
      ],
    },
    {
      id: "prebuilt-cs-ps-priority",
      questionText: "You have five accounts needing attention today. How do you prioritize?",
      questionType: "short_answer",
      rubric: [
        "rank by renewal risk and revenue",
        "handle anything blocking the customer first",
        "say which accounts wait and why",
        "batch the rest instead of half-doing all five",
      ],
    },
    {
      id: "prebuilt-cs-ps-root-cause",
      questionText: "Customers keep asking for training on the same feature. What does that tell you and what would you do?",
      questionType: "scenario",
      rubric: [
        "treat repeat questions as a product signal",
        "pass the pattern to product with evidence",
        "fix it once with a guide or in-app help",
        "measure whether the requests drop",
      ],
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
      rubric: [
        "describe what put the account at risk",
        "say what they personally did",
        "show they understood the customer's position",
        "give the renewal or usage result",
      ],
    },
    {
      id: "prebuilt-cs-beh-conflict",
      questionText: "Describe a disagreement with Sales about a customer commitment. How was it resolved?",
      questionType: "short_answer",
      rubric: [
        "describe what sales had promised",
        "say how they raised it internally",
        "protect the customer without attacking sales",
        "state how it was resolved",
      ],
    },
    {
      id: "prebuilt-cs-beh-feedback",
      questionText: "Share a time you translated customer feedback into a product change or process fix.",
      questionType: "short_answer",
      rubric: [
        "bring evidence from more than one customer",
        "take it to the team that could act",
        "describe the change that resulted",
        "say what improved for customers",
      ],
    },
    {
      id: "prebuilt-cs-beh-mistake",
      questionText: "Tell us about a customer-facing mistake you made. How did you recover trust?",
      questionType: "short_answer",
      rubric: [
        "state the mistake without excuses",
        "tell the customer before they find out",
        "describe how trust was rebuilt",
        "name what they do differently now",
      ],
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
      rubric: [
        "get both stakeholders into the same conversation",
        "restate each definition of success",
        "avoid siding with the louder voice",
        "leave with one written, agreed goal",
      ],
    },
    {
      id: "prebuilt-cs-lead-escalation",
      questionText: "When do you escalate an account issue to leadership, and what package of context do you bring?",
      questionType: "short_answer",
      rubric: [
        "escalate on revenue or trust risk, not annoyance",
        "bring the history and what was already tried",
        "state exactly what is being asked for",
        "propose the option you recommend",
      ],
    },
    {
      id: "prebuilt-cs-lead-playbook",
      questionText: "How would you design an onboarding playbook for a new mid-market segment?",
      questionType: "scenario",
      rubric: [
        "map the first 30, 60, and 90 days",
        "define the milestone that means adopted",
        "make the steps repeatable without them",
        "track time-to-value across the segment",
      ],
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
      rubric: [
        "record the interaction the same day",
        "write notes a colleague could act on",
        "keep the account usable while they are away",
      ],
    },
    {
      id: "prebuilt-cs-ws-proactive",
      questionText: "How strongly do you prefer proactive check-ins even when there is no open ticket?",
      questionType: "scale",
      options: ["1 - Reactive", "2", "3 - Balanced", "4", "5 - Highly proactive"],
      rubric: [
        "reach out before the customer complains",
        "tie the check-in to their goals",
        "catch renewal risk with time to act",
      ],
    },
    {
      id: "prebuilt-cs-ws-tools",
      questionText: "Which signals do you monitor weekly to catch churn risk early?",
      questionType: "short_answer",
      rubric: [
        "name specific signals such as declining logins",
        "watch sponsor changes and support volume",
        "act on the signal rather than only log it",
      ],
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
      rubric: [
        "segment the accounts before contacting them",
        "meet the highest-risk customers first",
        "build a repeatable weekly rhythm",
        "say what they would measure by day 90",
      ],
    },
    {
      id: "prebuilt-cs-ai-health",
      questionText: "Design a simple customer health score. Which inputs matter and which should you ignore?",
      questionType: "scenario",
      rubric: [
        "choose inputs that predict renewal",
        "reject vanity inputs and say why",
        "keep the score explainable to the team",
        "tie each score band to an action",
      ],
    },
    {
      id: "prebuilt-cs-ai-tools",
      questionText: "When is it appropriate to use AI-generated customer emails, and what review bar would you set?",
      questionType: "scenario",
      rubric: [
        "say which messages must be written personally",
        "read and correct the draft before sending",
        "keep customer data out of external tools",
        "own whatever goes out under their name",
      ],
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
