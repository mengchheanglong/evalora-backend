import type { AssessmentTemplateDto, CandidateReportDto, InterviewSessionDto } from "../domain/evalora.types";

export const templates: AssessmentTemplateDto[] = [
  {
    id: "software-engineer",
    title: "Software Engineer Assessment",
    description: "AI interview, JavaScript coding task, debugging, and technical reasoning.",
    roleType: "Software Engineer",
    modules: [
      {
        id: "mod-ai-interview",
        type: "ai_interview",
        title: "AI Interview",
        description: "Role-based questions and follow-up prompts.",
        weight: 1,
        orderIndex: 1,
      },
      {
        id: "mod-coding",
        type: "coding",
        title: "Coding Assessment",
        description: "JavaScript problem-solving task.",
        weight: 1.5,
        orderIndex: 2,
      },
      {
        id: "mod-work-style",
        type: "work_style",
        title: "Work-Style Assessment",
        description: "Collaboration, ownership, adaptability, and motivation.",
        weight: 1,
        orderIndex: 3,
      },
    ],
  },
];

export const sessions: InterviewSessionDto[] = [
  {
    id: "demo-session",
    candidateName: "Demo Candidate",
    templateId: "software-engineer",
    status: "in_progress",
    accessCode: "DEMO-2026",
  },
];

export const demoReport: CandidateReportDto = {
  sessionId: "demo-session",
  candidateName: "Demo Candidate",
  assessmentName: "Software Engineer Assessment",
  overallScore: 4.1,
  moduleScores: {
    "AI Interview": 4.0,
    "Coding Assessment": 4.2,
    "Work-Style Assessment": 4.1,
  },
  summary: "The candidate shows solid technical reasoning, clear communication, and reflective work-style responses.",
  strengths: ["Explains trade-offs clearly", "Shows ownership", "Uses practical debugging steps"],
  improvementAreas: ["Could provide more test coverage detail", "Could quantify performance decisions more precisely"],
  evidence: [
    "Candidate described a production bug process with rollback, logs, and follow-up tests.",
    "Coding answer included readable function structure and edge-case handling.",
  ],
  advisoryNotice: "AI feedback is advisory and must be reviewed by a human interviewer before any decision.",
};
