import type { CodeDifficulty, CodeLanguage } from "../types/code.types";

export interface CodeTestCase {
  stdin: string;
  expectedOutput: string;
}

export interface CodeQuestion {
  id: string;
  title: string;
  description: string;
  difficulty: CodeDifficulty;
  starterCode: string;
  language: CodeLanguage;
  sampleInput: string;
  sampleOutput: string;
  testCases: CodeTestCase[];
}

export interface CodeSubmissionView {
  id: string;
  sessionId: string;
  questionId: string;
  language: string;
  sourceCode: string;
  stdout: string;
  stderr: string;
  compileOutput: string;
  status: string;
  executionTime: number;
  score: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionSnapshot {
  id: string;
  status: string;
  expiresAt: Date | null;
}