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
      questionText: "Implement a function that normalizes a list of display names: trim, drop blanks, title-case words, and preserve order.",
      questionType: "coding",
      rubric: [
        "trim, drop blanks, and title-case correctly",
        "handle empty arrays and odd spacing",
        "keep the original order",
        "return a new array without mutating input",
      ],
    },
    {
      id: "prebuilt-fe-code-group",
      questionText: "Given an array of UI events with { type, timestamp }, return counts grouped by type sorted by frequency descending.",
      questionType: "coding",
      rubric: [
        "count by type in a single pass",
        "sort by frequency with a stable tiebreak",
        "use names that show intent",
        "avoid repeated scans of the array",
      ],
    },
    {
      id: "prebuilt-fe-code-debounce-explain",
      questionText: "Explain how you would implement a debounce utility for a search input and what bugs you would test for.",
      questionType: "short_answer",
      rubric: [
        "explain the timer reset on each keystroke",
        "choose a delay the user will not notice",
        "name bugs such as stale results arriving late",
        "describe cancel and flush behaviour",
      ],
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
      rubric: [
        "profile the page before changing code",
        "find the state that lives too high",
        "explain why the children re-render",
        "measure again to confirm the fix",
      ],
    },
    {
      id: "prebuilt-fe-debug-layout",
      questionText: "A layout shifts only on mobile Safari after images load. How do you diagnose and prevent it?",
      questionType: "scenario",
      rubric: [
        "reserve space for images before they load",
        "reproduce it on the reported device",
        "name the css that behaves differently there",
        "add a check that catches layout shift",
      ],
    },
    {
      id: "prebuilt-fe-debug-state",
      questionText: "Users report a form sometimes submits stale values. Walk through your debugging approach.",
      questionType: "short_answer",
      rubric: [
        "find the input that produces stale values",
        "look for closures over old state",
        "check the order of async updates",
        "add a test before changing the handler",
      ],
    },
    {
      id: "prebuilt-fe-debug-prod",
      questionText: "A bug appears for only 3% of users after deploy. What is your investigation sequence?",
      questionType: "scenario",
      rubric: [
        "find what the affected users have in common",
        "use error reports rather than guesses",
        "consider rolling back before debugging",
        "limit exposure while they investigate",
      ],
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
      rubric: [
        "keep the props small and predictable",
        "design empty and loading states explicitly",
        "let callers compose rather than configure",
        "make sorting reachable by keyboard",
      ],
    },
    {
      id: "prebuilt-fe-ai-a11y",
      questionText: "How do you make a complex modal dialog accessible (keyboard, focus, screen readers)?",
      questionType: "short_answer",
      rubric: [
        "trap and restore focus around the dialog",
        "close on escape and on overlay click",
        "label the dialog for screen readers",
        "test with a keyboard and a screen reader",
      ],
    },
    {
      id: "prebuilt-fe-ai-perf",
      questionText: "A dashboard takes six or more seconds on first load. Which measurements (for example Core Web Vitals) and which changes would you prioritize?",
      questionType: "scenario",
      rubric: [
        "measure before optimising",
        "name a metric such as largest contentful paint",
        "cut the largest cost first",
        "separate network cost from rendering cost",
      ],
    },
    {
      id: "prebuilt-fe-ai-ai-tools",
      questionText: "When is it responsible to use AI-generated UI code in production, and what review bar would you set?",
      questionType: "scenario",
      rubric: [
        "say where generated ui code is safe to use",
        "read and test it before merging",
        "take responsibility for what ships",
        "check accessibility and any dependency added",
      ],
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
      rubric: [
        "say what slips and what still ships",
        "explain the user cost of the delay",
        "avoid jargon the reader cannot act on",
        "offer a smaller version as an option",
      ],
    },
    {
      id: "prebuilt-fe-comm-design",
      questionText: "A design is beautiful but expensive to implement accessibly. How do you raise the issue constructively?",
      questionType: "scenario",
      rubric: [
        "raise it early with the designer",
        "explain the accessibility problem concretely",
        "propose an alternative that keeps the intent",
        "treat the constraint as shared, not theirs",
      ],
    },
    {
      id: "prebuilt-fe-comm-review",
      questionText: "How do you give code review feedback when a teammate's PR is hard to maintain?",
      questionType: "short_answer",
      rubric: [
        "comment on the code, not the person",
        "explain why it will be hard to change",
        "suggest a concrete improvement",
        "separate must-fix from nice-to-have",
      ],
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
      rubric: [
        "describe what they owned end to end",
        "name the metric they moved",
        "say how success was measured",
        "describe what shipped and when",
      ],
    },
    {
      id: "prebuilt-fe-beh-failure",
      questionText: "Describe a frontend bug that reached production. What did you change afterward?",
      questionType: "short_answer",
      rubric: [
        "state the bug and its effect on users",
        "own their part in shipping it",
        "name the test or check added",
        "describe the process change afterward",
      ],
    },
    {
      id: "prebuilt-fe-beh-learn",
      questionText: "How did you ramp up on an unfamiliar frontend stack under deadline pressure?",
      questionType: "short_answer",
      rubric: [
        "describe how they got productive quickly",
        "name the sources or people they used",
        "say what they shipped under the deadline",
        "describe what they flagged to the team",
      ],
    },
    {
      id: "prebuilt-fe-beh-conflict",
      questionText: "Share a technical disagreement about UI architecture. How was it resolved?",
      questionType: "short_answer",
      rubric: [
        "describe the other position fairly",
        "bring a prototype or data to the argument",
        "admit which part they got wrong",
        "say how the decision held up",
      ],
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
      rubric: [
        "cover the flows that lose users or money",
        "keep the standard when the deadline is close",
        "say which changes do not need a test",
      ],
    },
    {
      id: "prebuilt-fe-ws-design-system",
      questionText: "How strongly do you prefer reusing design-system components over one-off styling?",
      questionType: "scale",
      options: ["1 - One-offs OK", "2", "3 - Balanced", "4", "5 - System first"],
      rubric: [
        "reuse the component before writing new css",
        "improve the shared system instead of forking it",
        "say when a one-off is justified",
      ],
    },
    {
      id: "prebuilt-fe-ws-handoff",
      questionText: "What does a good Design → Engineering handoff look like for you?",
      questionType: "short_answer",
      rubric: [
        "agree states, spacing, and behaviour up front",
        "raise feasibility questions before build",
        "leave a record both sides can check",
      ],
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
