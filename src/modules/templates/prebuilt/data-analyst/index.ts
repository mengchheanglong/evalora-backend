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
      rubric: [
        "rule out tracking and pipeline problems first",
        "break the drop down by segment and platform",
        "list the causes worth testing, in order",
        "check whether the metric definition changed",
      ],
    },
    {
      id: "prebuilt-da-ps-metric",
      questionText: "Product wants a single 'health' score for onboarding. How would you design it and what risks would you call out?",
      questionType: "scenario",
      rubric: [
        "tie each input to the onboarding outcome",
        "say what a single score hides",
        "name how the score could be gamed",
        "keep it explainable to a non-analyst",
      ],
    },
    {
      id: "prebuilt-da-ps-experiment",
      questionText: "An A/B test shows a +4% lift with p=0.08 after two days. What do you recommend and why?",
      questionType: "scenario",
      rubric: [
        "say the test has not run long enough",
        "explain what the p-value does and does not mean",
        "warn against stopping early on a peek",
        "state the decision they would recommend today",
      ],
    },
    {
      id: "prebuilt-da-ps-data-quality",
      questionText: "Two dashboards disagree on the same KPI. How do you reconcile them?",
      questionType: "short_answer",
      rubric: [
        "compare the two metric definitions first",
        "check filters, time zones, and late-arriving rows",
        "trace both back to the source table",
        "publish one agreed number afterward",
      ],
    },
    {
      id: "prebuilt-da-ps-sql-thinking",
      questionText: "Describe how you would compute 7-day retention by cohort from event logs (tables and joins at a high level).",
      questionType: "short_answer",
      rubric: [
        "define the cohort by first-event date",
        "join later events back to the cohort day",
        "state what counts as retained on day seven",
        "handle users with no later events",
      ],
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
      rubric: [
        "lead with the finding, not the method",
        "say which decision it should change",
        "cut detail an executive cannot act on",
        "state the confidence and the main caveat",
      ],
    },
    {
      id: "prebuilt-da-comm-caveat",
      questionText: "How do you present uncertain results without either overclaiming or burying the recommendation?",
      questionType: "short_answer",
      rubric: [
        "give the range, not a single number",
        "say what would change the conclusion",
        "still make a clear recommendation",
        "separate what is known from what is assumed",
      ],
    },
    {
      id: "prebuilt-da-comm-viz",
      questionText: "A stakeholder wants a pie chart for a time series. How do you respond and what would you show instead?",
      questionType: "scenario",
      rubric: [
        "explain why a pie chart hides the trend",
        "offer a line chart as the alternative",
        "ask what question they want answered",
        "teach without talking down",
      ],
    },
    {
      id: "prebuilt-da-comm-pushback",
      questionText: "Leadership wants a chart that cherry-picks a favorable window. How do you handle it?",
      questionType: "scenario",
      rubric: [
        "refuse to present a misleading window",
        "explain the credibility risk if it is noticed",
        "offer an honest chart that still helps",
        "raise it privately before escalating",
      ],
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
      rubric: [
        "name the decision the analysis changed",
        "describe what they did themselves",
        "say who they had to convince",
        "give the measurable result",
      ],
    },
    {
      id: "prebuilt-da-beh-wrong",
      questionText: "Describe a time your analysis was wrong or incomplete. What did you do next?",
      questionType: "short_answer",
      rubric: [
        "say what was wrong and how it surfaced",
        "correct it before others acted on it",
        "tell everyone who used the number",
        "describe the check added since",
      ],
    },
    {
      id: "prebuilt-da-beh-partner",
      questionText: "How have you partnered with Engineering or Product when data pipelines were incomplete?",
      questionType: "short_answer",
      rubric: [
        "describe the gap in the data available",
        "agree a workable interim answer",
        "get engineering to fix the source",
        "say what shipped despite the gap",
      ],
    },
    {
      id: "prebuilt-da-beh-priority",
      questionText: "Share a time you said no to an analysis request. How did you decide and communicate it?",
      questionType: "short_answer",
      rubric: [
        "explain what the request would displace",
        "say no with a reason, not a refusal",
        "offer a smaller or later alternative",
        "check the decision against the requester's goal",
      ],
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
      rubric: [
        "share code another analyst can rerun",
        "record the query and the data version",
        "check the numbers before publishing",
      ],
    },
    {
      id: "prebuilt-da-ws-docs",
      questionText: "How strongly do you prefer documenting metric definitions in a shared catalog?",
      questionType: "scale",
      options: ["1 - Ad hoc", "2", "3 - Sometimes", "4", "5 - Always"],
      rubric: [
        "write the definition where others will find it",
        "keep one named owner per metric",
        "update the entry when the logic changes",
      ],
    },
    {
      id: "prebuilt-da-ws-cadence",
      questionText: "What is your preferred cadence for proactive insight reviews with stakeholders?",
      questionType: "short_answer",
      rubric: [
        "set a regular review with stakeholders",
        "bring findings they did not ask for",
        "match the cadence to how fast decisions move",
      ],
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
      rubric: [
        "get the teams to agree one definition",
        "document the edge cases explicitly",
        "win support rather than mandate it",
        "publish where the definition lives",
      ],
    },
    {
      id: "prebuilt-da-lead-priority",
      questionText: "Three teams want dashboards this week. How do you decide what gets built first?",
      questionType: "scenario",
      rubric: [
        "rank by the decision each dashboard enables",
        "ask what happens if it waits a week",
        "tell the teams the order and the reason",
        "say what they will not build at all",
      ],
    },
    {
      id: "prebuilt-da-lead-challenge",
      questionText: "A director insists on a vanity metric. How do you challenge the request while keeping trust?",
      questionType: "scenario",
      rubric: [
        "say why the metric misleads",
        "ask what question they really want answered",
        "offer a measure that answers it",
        "disagree without embarrassing them",
      ],
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
      rubric: [
        "instrument the core user journey first",
        "define activation and retention early",
        "ask leaders which decisions are blocked",
        "ship something useful in weeks, not months",
      ],
    },
    {
      id: "prebuilt-da-ai-llm",
      questionText: "How would you evaluate whether an LLM summary of support tickets is reliable enough for product decisions?",
      questionType: "scenario",
      rubric: [
        "compare summaries against a labelled sample",
        "check for missed or invented detail",
        "look for over-represented ticket types",
        "keep a person in the loop for large calls",
      ],
    },
    {
      id: "prebuilt-da-ai-story",
      questionText: "Walk us through a dataset you know well. What story does it tell, and what would you not claim from it?",
      questionType: "scenario",
      rubric: [
        "explain what the data was collected for",
        "name the pattern that matters most",
        "say which conclusions it cannot support",
        "separate correlation from cause",
      ],
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
