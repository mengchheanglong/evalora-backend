import type { CodeLanguage } from "../types/code.types";
import type { CodeExecutionStatus } from "../types/code.types";

export interface Judge0ExecutionRequest {
  language: CodeLanguage;
  sourceCode: string;
  stdin?: string;
  expectedOutput?: string;
}

export interface Judge0ExecutionResult {
  stdout: string;
  stderr: string;
  compileOutput: string;
  status: CodeExecutionStatus;
  executionTime: number;
}

interface Judge0SubmissionResponse {
  token: string;
}

interface Judge0StatusPayload {
  id: number;
  description: string;
}

export interface Judge0ResultPayload {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  time: string | null;
  status: Judge0StatusPayload;
}

export interface Judge0SubmissionResult extends Judge0SubmissionResponse, Judge0ResultPayload {}