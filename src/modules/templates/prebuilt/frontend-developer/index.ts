import type { PrebuiltAssessmentTemplateDefinition, PrebuiltModuleDefinition } from "../types";

const coding: PrebuiltModuleDefinition = {
  id: "prebuilt-fe-coding",
  type: "coding",
  title: "Frontend Coding",
  description: "Practical JavaScript/UI logic tasks with edge-case awareness.",
  weight: 1.5,
  orderIndex: 1,
  settings: { recommendedMinutes: 25, language: "javascript" },
  questions: [
    {
      id: "prebuilt-fe-code-normalize",
      questionText: "Read a line of space-separated integers and print them sorted in ascending order, space-separated.",
      questionType: "coding",
      options: { codeQuestionId: "sort-ascending" },
      rubric: ["correctness", "edge-cases", "readability", "complexity"],
    },
    {
      id: "prebuilt-fe-code-group",
      questionText: "Read a string (ignoring spaces) and print the character that appears most often. If several tie, print the alphabetically smallest.",
      questionType: "coding",
      options: { codeQuestionId: "most-frequent-char" },
      rubric: ["correctness", "edge-cases", "readability", "complexity"],
    },
    {
      id: "prebuilt-fe-code-debounce-explain",
      questionText: "Read a single word and print it reversed.",
      questionType: "coding",
      options: { codeQuestionId: "reverse-string" },
      rubric: ["correctness", "edge-cases", "readability", "complexity"],
    },
  ],
};

const debugging: PrebuiltModuleDefinition = {
  id: "prebuilt-fe-debugging",
  type: "debugging",
  title: "UI Debugging",
  description: "Root-cause analysis for browser, state, and performance issues.",
  weight: 1.2,
  orderIndex: 2,
  settings: { recommendedMinutes: 12 },
  questions: [
    {
      id: "prebuilt-fe-debug-rerender",
      questionText: "A React page re-renders on every keystroke and feels laggy. How would you isolate and fix the cause?",
      questionType: "scenario",
      rubric: ["performance", "react-mental-model", "tooling", "verification"],
    },
    {
      id: "prebuilt-fe-debug-layout",
      questionText: "A layout shifts only on mobile Safari after images load. How do you diagnose and prevent it?",
      questionType: "scenario",
      rubric: ["css", "browser-differences", "cls", "prevention"],
    },
    {
      id: "prebuilt-fe-debug-state",
      questionText: "Users report a form sometimes submits stale values. Walk through your debugging approach.",
      questionType: "short_answer",
      rubric: ["state-management", "async", "reproduction", "fix-strategy"],
    },
    {
      id: "prebuilt-fe-debug-prod",
      questionText: "A bug appears for only 3% of users after deploy. What is your investigation sequence?",
      questionType: "scenario",
      rubric: ["production-debug", "observability", "rollout", "risk"],
    },
  ],
};

const aiInterview: PrebuiltModuleDefinition = {
  id: "prebuilt-fe-ai-interview",
  type: "ai_interview",
  title: "Frontend Interview",
  description: "Architecture trade-offs, accessibility, and product-minded UI craft.",
  weight: 1.15,
  orderIndex: 3,
  settings: { recommendedMinutes: 14, allowFollowUps: true },
  questions: [
    {
      id: "prebuilt-fe-ai-component",
      questionText: "Design a reusable table component API that supports sorting, empty states, and loading. What trade-offs do you make?",
      questionType: "scenario",
      rubric: ["api-design", "ux", "composability", "accessibility"],
    },
    {
      id: "prebuilt-fe-ai-a11y",
      questionText: "How do you make a complex modal dialog accessible (keyboard, focus, screen readers)?",
      questionType: "short_answer",
      rubric: ["accessibility", "standards", "practical-detail", "testing"],
    },
    {
      id: "prebuilt-fe-ai-perf",
      questionText: "A dashboard takes six or more seconds on first load. Which measurements (for example Core Web Vitals) and which changes would you prioritize?",
      questionType: "scenario",
      rubric: ["performance", "measurement", "prioritization", "web-vitals"],
    },
    {
      id: "prebuilt-fe-ai-ai-tools",
      questionText: "When is it responsible to use AI-generated UI code in production, and what review bar would you set?",
      questionType: "scenario",
      rubric: ["ai-judgment", "quality", "ownership", "risk"],
    },
  ],
};

const communication: PrebuiltModuleDefinition = {
  id: "prebuilt-fe-communication",
  type: "communication",
  title: "Engineering Communication",
  description: "Explaining UI trade-offs to PMs, designers, and other engineers.",
  weight: 1.0,
  orderIndex: 4,
  settings: { recommendedMinutes: 10 },
  questions: [
    {
      id: "prebuilt-fe-comm-tradeoff",
      questionText: "Write a short update to your PM explaining why a polished animation should slip to next sprint.",
      questionType: "roleplay",
      rubric: ["clarity", "product-sense", "risk", "collaboration"],
    },
    {
      id: "prebuilt-fe-comm-design",
      questionText: "A design is beautiful but expensive to implement accessibly. How do you raise the issue constructively?",
      questionType: "scenario",
      rubric: ["collaboration", "respect", "problem-solving", "standards"],
    },
    {
      id: "prebuilt-fe-comm-review",
      questionText: "How do you give code review feedback when a teammate's PR is hard to maintain?",
      questionType: "short_answer",
      rubric: ["feedback", "empathy", "quality", "mentorship"],
    },
  ],
};

const behavioral: PrebuiltModuleDefinition = {
  id: "prebuilt-fe-behavioral",
  type: "behavioral",
  title: "Behavioral",
  description: "Ownership, learning velocity, and collaboration on UI work.",
  weight: 1.0,
  orderIndex: 5,
  settings: { recommendedMinutes: 10 },
  questions: [
    {
      id: "prebuilt-fe-beh-ownership",
      questionText: "Tell us about a UI feature you owned end-to-end. How did you measure success?",
      questionType: "short_answer",
      rubric: ["ownership", "impact", "metrics", "delivery"],
    },
    {
      id: "prebuilt-fe-beh-failure",
      questionText: "Describe a frontend bug that reached production. What did you change afterward?",
      questionType: "short_answer",
      rubric: ["accountability", "learning", "process-improvement", "prevention"],
    },
    {
      id: "prebuilt-fe-beh-learn",
      questionText: "How did you ramp up on an unfamiliar frontend stack under deadline pressure?",
      questionType: "short_answer",
      rubric: ["learning", "resourcefulness", "execution", "communication"],
    },
    {
      id: "prebuilt-fe-beh-conflict",
      questionText: "Share a technical disagreement about UI architecture. How was it resolved?",
      questionType: "short_answer",
      rubric: ["collaboration", "evidence", "humility", "decision-quality"],
    },
  ],
};

const workStyle: PrebuiltModuleDefinition = {
  id: "prebuilt-fe-work-style",
  type: "work_style",
  title: "Work Style",
  description: "Quality bar, collaboration, and delivery preferences.",
  weight: 0.85,
  orderIndex: 6,
  settings: { recommendedMinutes: 8 },
  questions: [
    {
      id: "prebuilt-fe-ws-tests",
      questionText: "How strongly do you prefer automated UI tests before merging user-facing changes?",
      questionType: "scale",
      options: ["1 - Rarely", "2", "3 - Sometimes", "4", "5 - Always for critical flows"],
      rubric: ["quality", "discipline", "risk-awareness"],
    },
    {
      id: "prebuilt-fe-ws-design-system",
      questionText: "How strongly do you prefer reusing design-system components over one-off styling?",
      questionType: "scale",
      options: ["1 - One-offs OK", "2", "3 - Balanced", "4", "5 - System first"],
      rubric: ["consistency", "maintainability", "craft"],
    },
    {
      id: "prebuilt-fe-ws-handoff",
      questionText: "What does a good Design → Engineering handoff look like for you?",
      questionType: "short_answer",
      rubric: ["collaboration", "clarity", "process"],
    },
  ],
};

export const frontendDeveloperTemplate: PrebuiltAssessmentTemplateDefinition = {
  id: "prebuilt-frontend-developer-assessment",
  title: "Frontend Developer Assessment",
  description:
    "UI coding, debugging, accessibility, performance judgment, collaboration, and delivery discipline for frontend engineer screens.",
  roleType: "Frontend Developer",
  timeLimitMin: 85,
  scoringRules: {
    passScore: 3.6,
    scale: "1-5",
    source: "prebuilt-researched-v2",
    recommendedCandidateQuestionCount: { min: 9, max: 13, practicalTasks: 1 },
    notes: "Pair one coding task with debugging and one product/accessibility discussion.",
  },
  modules: [coding, debugging, aiInterview, communication, behavioral, workStyle],
};
