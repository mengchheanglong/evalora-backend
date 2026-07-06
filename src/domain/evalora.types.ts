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

export type QuestionType = "mcq" | "scale" | "short_answer" | "coding" | "scenario" | "roleplay";

export type JsonValue = any;

export interface QuestionDto {
  id: string;
  questionText: string;
  questionType: QuestionType;
  options?: JsonValue;
  rubric?: JsonValue;
}

export interface AssessmentModuleDto {
  id: string;
  type: ModuleType;
  title: string;
  description: string;
  weight: number;
  orderIndex: number;
  settings?: JsonValue;
  questions?: QuestionDto[];
}

export interface AssessmentTemplateDto {
  id: string;
  title: string;
  description: string;
  roleType: string;
  timeLimitMin?: number;
  scoringRules?: JsonValue;
  createdById?: string;
  organizationId?: string;
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
  completedAt?: string;
  overallScore: number;
  moduleScores: Record<string, number>;
  summary: string;
  strengths: string[];
  improvementAreas: string[];
  evidence: string[];
  reviewerSummary?: string;
  advisoryNotice: string;
}
