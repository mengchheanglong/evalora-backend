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
  candidateId?: string;
  candidateName: string;
  candidateEmail?: string;
  templateId: string;
  templateTitle?: string;
  /** Session-level position/role; falls back to template role type. */
  targetRole?: string;
  title?: string;
  interviewType?: string;
  /** Named interviewers from the workspace create form. */
  interviewers?: string[];
  /** Primary interviewer label for list/detail UI. */
  interviewerName?: string;
  interviewerRole?: string;
  notes?: string;
  department?: string;
  scheduledAt?: string;
  durationMin?: number;
  language?: string;
  timeZone?: string;
  createdById?: string;
  organizationId?: string;
  status: SessionStatus;
  accessCode: string;
  /** Absolute candidate assessment URL when APP_URL / FRONTEND_URL is configured. */
  assessmentUrl?: string;
  /** Result of Resend (or skipped/failed) delivery for the candidate invite email. */
  emailDelivery?: {
    status: "sent" | "skipped" | "failed" | "queued";
    reason?: string;
    messageId?: string;
    provider?: "resend" | "gmail" | "none";
  };
  overallScore?: number;
  reportReady?: boolean;
  warningCount?: number;
  warningLimit?: number;
  startedAt?: string;
  completedAt?: string;
  expiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CandidateResponseDto {
  id: string;
  sessionId: string;
  questionId?: string;
  responseText: string;
  responseJson?: JsonValue;
  savedAt?: string;
  createdAt?: string;
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
