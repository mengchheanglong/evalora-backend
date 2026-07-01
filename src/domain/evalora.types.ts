export type UserRole = "admin" | "organization" | "interviewer" | "candidate";

export type SessionStatus = "not_started" | "in_progress" | "completed" | "expired";

export type ModuleType =
  | "ai_interview"
  | "coding"
  | "debugging"
  | "work_style"
  | "behavioral"
  | "leadership"
  | "communication"
  | "problem_solving";

export interface AssessmentModuleDto {
  id: string;
  type: ModuleType;
  title: string;
  description: string;
  weight: number;
  orderIndex: number;
}

export interface AssessmentTemplateDto {
  id: string;
  title: string;
  description: string;
  roleType: string;
  modules: AssessmentModuleDto[];
}

export interface InterviewSessionDto {
  id: string;
  candidateName: string;
  templateId: string;
  status: SessionStatus;
  accessCode: string;
}

export interface CandidateReportDto {
  sessionId: string;
  candidateName: string;
  assessmentName: string;
  overallScore: number;
  moduleScores: Record<string, number>;
  summary: string;
  strengths: string[];
  improvementAreas: string[];
  evidence: string[];
  advisoryNotice: string;
}
