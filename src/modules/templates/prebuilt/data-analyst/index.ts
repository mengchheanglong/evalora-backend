import type { PrebuiltAssessmentTemplateDefinition, PrebuiltModuleDefinition } from "../types";

const problemSolving: PrebuiltModuleDefinition = {
  id: "prebuilt-da-problem-solving",
  type: "problem_solving",
  title: "Analytical Problem Solving",
  description: "Metrics definition, investigation structure, and decision support under ambiguity.",
  weight: 1.4,
  orderIndex: 1,
  settings: { recommendedMinutes: 16 },
  questions: [
    {
      id: "prebuilt-da-ps-drop",
      questionText: "Weekly active users fell 12% week-over-week. Outline your investigation plan and what you would check first.",
      questionType: "scenario",
      rubric: ["structured-thinking", "hypothesis", "metrics-literacy", "prioritization"],
    },
    {
      id: "prebuilt-da-ps-metric",
      questionText: "Product wants a single 'health' score for onboarding. How would you design it and what risks would you call out?",
      questionType: "scenario",
      rubric: ["metric-design", "trade-offs", "gaming-risks", "clarity"],
    },
    {
      id: "prebuilt-da-ps-experiment",
      questionText: "An A/B test shows a +4% lift with p=0.08 after two days. What do you recommend and why?",
      questionType: "scenario",
      rubric: ["experimentation", "statistical-judgment", "risk", "communication"],
    },
    {
      id: "prebuilt-da-ps-data-quality",
      questionText: "Two dashboards disagree on the same KPI. How do you reconcile them?",
      questionType: "short_answer",
      rubric: ["data-quality", "definitions", "root-cause", "trust"],
    },
    {
      id: "prebuilt-da-ps-sql-thinking",
      questionText: "Describe how you would compute 7-day retention by cohort from event logs (tables and joins at a high level).",
      questionType: "short_answer",
      rubric: ["sql-thinking", "cohorts", "retention", "clarity"],
    },
  ],
};

const communication: PrebuiltModuleDefinition = {
  id: "prebuilt-da-communication",
  type: "communication",
  title: "Insight Communication",
  description: "Turning analysis into decisions for non-technical stakeholders.",
  weight: 1.2,
  orderIndex: 2,
  settings: { recommendedMinutes: 12 },
  questions: [
    {
      id: "prebuilt-da-comm-exec",
      questionText: "Write a 5-bullet executive summary of a finding that a feature is not driving retention.",
      questionType: "roleplay",
      rubric: ["clarity", "actionability", "audience-fit", "honesty"],
    },
    {
      id: "prebuilt-da-comm-caveat",
      questionText: "How do you present uncertain results without either overclaiming or burying the recommendation?",
      questionType: "short_answer",
      rubric: ["nuance", "confidence", "recommendation", "trust"],
    },
    {
      id: "prebuilt-da-comm-viz",
      questionText: "A stakeholder wants a pie chart for a time series. How do you respond and what would you show instead?",
      questionType: "scenario",
      rubric: ["visualization", "persuasion", "education", "usefulness"],
    },
    {
      id: "prebuilt-da-comm-pushback",
      questionText: "Leadership wants a chart that cherry-picks a favorable window. How do you handle it?",
      questionType: "scenario",
      rubric: ["ethics", "courage", "alternatives", "professionalism"],
    },
  ],
};

const behavioral: PrebuiltModuleDefinition = {
  id: "prebuilt-da-behavioral",
  type: "behavioral",
  title: "Behavioral Evidence",
  description: "Past analytical work, partnership with product/engineering, and learning style.",
  weight: 1.05,
  orderIndex: 3,
  settings: { recommendedMinutes: 12 },
  questions: [
    {
      id: "prebuilt-da-beh-impact",
      questionText: "Tell us about an analysis that changed a real business decision. What was the impact?",
      questionType: "short_answer",
      rubric: ["impact", "ownership", "stakeholder-management", "outcomes"],
    },
    {
      id: "prebuilt-da-beh-wrong",
      questionText: "Describe a time your analysis was wrong or incomplete. What did you do next?",
      questionType: "short_answer",
      rubric: ["humility", "correction", "communication", "learning"],
    },
    {
      id: "prebuilt-da-beh-partner",
      questionText: "How have you partnered with Engineering or Product when data pipelines were incomplete?",
      questionType: "short_answer",
      rubric: ["collaboration", "pragmatism", "influence", "delivery"],
    },
    {
      id: "prebuilt-da-beh-priority",
      questionText: "Share a time you said no to an analysis request. How did you decide and communicate it?",
      questionType: "short_answer",
      rubric: ["prioritization", "boundaries", "communication", "judgment"],
    },
  ],
};

const workStyle: PrebuiltModuleDefinition = {
  id: "prebuilt-da-work-style",
  type: "work_style",
  title: "Work Style",
  description: "Rigor, documentation, and operating preferences for analytics work.",
  weight: 0.9,
  orderIndex: 4,
  settings: { recommendedMinutes: 8 },
  questions: [
    {
      id: "prebuilt-da-ws-repro",
      questionText: "How strongly do you prefer fully reproducible analysis notebooks/scripts before sharing conclusions?",
      questionType: "scale",
      options: ["1 - Rarely", "2", "3 - Sometimes", "4", "5 - Always"],
      rubric: ["rigor", "reproducibility", "quality"],
    },
    {
      id: "prebuilt-da-ws-docs",
      questionText: "How strongly do you prefer documenting metric definitions in a shared catalog?",
      questionType: "scale",
      options: ["1 - Ad hoc", "2", "3 - Sometimes", "4", "5 - Always"],
      rubric: ["documentation", "team-scale", "trust"],
    },
    {
      id: "prebuilt-da-ws-cadence",
      questionText: "What is your preferred cadence for proactive insight reviews with stakeholders?",
      questionType: "short_answer",
      rubric: ["operating-rhythm", "partnership", "proactivity"],
    },
  ],
};

const leadership: PrebuiltModuleDefinition = {
  id: "prebuilt-da-leadership",
  type: "leadership",
  title: "Analytical Leadership",
  description: "Influencing decisions, setting measurement standards, and guiding stakeholders with data.",
  weight: 1.0,
  orderIndex: 5,
  settings: { recommendedMinutes: 10 },
  questions: [
    {
      id: "prebuilt-da-lead-standards",
      questionText: "How would you establish a shared metric dictionary when every team defines 'active user' differently?",
      questionType: "scenario",
      rubric: ["standards", "facilitation", "influence", "clarity"],
    },
    {
      id: "prebuilt-da-lead-priority",
      questionText: "Three teams want dashboards this week. How do you decide what gets built first?",
      questionType: "scenario",
      rubric: ["prioritization", "stakeholder-management", "value", "boundaries"],
    },
    {
      id: "prebuilt-da-lead-challenge",
      questionText: "A director insists on a vanity metric. How do you challenge the request while keeping trust?",
      questionType: "scenario",
      rubric: ["courage", "diplomacy", "education", "alternatives"],
    },
  ],
};

const aiInterview: PrebuiltModuleDefinition = {
  id: "prebuilt-da-ai-interview",
  type: "ai_interview",
  title: "Analytics Interview",
  description: "Open-ended analytical judgment and AI-era data practices.",
  weight: 1.1,
  orderIndex: 6,
  settings: { recommendedMinutes: 12, allowFollowUps: true },
  questions: [
    {
      id: "prebuilt-da-ai-first-week",
      questionText: "If you joined as the first analyst on a product, what would you instrument and report in month one?",
      questionType: "scenario",
      rubric: ["prioritization", "measurement", "stakeholder-value", "pragmatism"],
    },
    {
      id: "prebuilt-da-ai-llm",
      questionText: "How would you evaluate whether an LLM summary of support tickets is reliable enough for product decisions?",
      questionType: "scenario",
      rubric: ["ai-literacy", "evaluation", "bias", "risk"],
    },
    {
      id: "prebuilt-da-ai-story",
      questionText: "Walk us through a dataset you know well. What story does it tell, and what would you not claim from it?",
      questionType: "scenario",
      rubric: ["storytelling", "limits", "domain-sense", "honesty"],
    },
  ],
};

export const dataAnalystTemplate: PrebuiltAssessmentTemplateDefinition = {
  id: "prebuilt-data-analyst-assessment",
  title: "Data Analyst Assessment",
  description:
    "Analytical problem solving, metric design, experimentation judgment, insight communication, and partnership skills for analyst screens.",
  roleType: "Data Analyst",
  timeLimitMin: 70,
  scoringRules: {
    passScore: 3.5,
    scale: "1-5",
    source: "prebuilt-researched-v2",
    recommendedCandidateQuestionCount: { min: 9, max: 13 },
    notes: "Focus on structured investigation plus communication of uncertainty.",
  },
  modules: [problemSolving, communication, behavioral, workStyle, leadership, aiInterview],
};
