export const CODE_DIFFICULTIES = ["easy", "medium", "hard"] as const;

export type CodeDifficulty = (typeof CODE_DIFFICULTIES)[number];

export type CodeLanguage = "javascript";

export type CodeExecutionStatus =
  | "Accepted"
  | "Wrong Answer"
  | "Compilation Error"
  | "Runtime Error"
  | "Time Limit Exceeded"
  | "Judge0 Unavailable";

export interface CodeRunResult {
  stdout: string;
  stderr: string;
  compileOutput: string;
  status: CodeExecutionStatus;
  executionTime: number;
}

export interface CodeTestCaseResult {
  stdin: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
  status: CodeExecutionStatus;
  executionTime: number;
}

export interface CodeSubmitResult extends CodeRunResult {
  submissionId: string;
  sessionId: string;
  questionId: string;
  score: number;
  totalTestCases: number;
  passedTestCases: number;
  testResults: CodeTestCaseResult[];
}

export interface CodeExample {
  input: string;
  expectedOutput: string;
}

export interface CodeQuestionSummary {
  id: string;
  title: string;
  description: string;
  difficulty: CodeDifficulty;
  starterCode: string;
  language: CodeLanguage;
  sampleInput: string;
  sampleOutput: string;
  examples: CodeExample[];
}

export interface CodeGradeResult {
  questionId: string;
  passed: boolean;
  score: number;
  totalTestCases: number;
  passedTestCases: number;
  status: CodeExecutionStatus;
  stdout: string;
  stderr: string;
  compileOutput: string;
  testResults: CodeTestCaseResult[];
}