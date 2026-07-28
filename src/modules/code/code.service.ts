import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { buildSessionOwnershipWhere, type AccessContext } from "../auth/access-control";
import { DEFAULT_LIST_LIMIT } from "../../common/query.constants";
import { CodeExecutionService } from "./code-execution.service";
import { CODE_QUESTION_INDEX, CODE_QUESTIONS, SUPPORTED_CODE_LANGUAGES } from "./constants/code.constants";
import type { CodeQuestion, SessionSnapshot } from "./interfaces/code.interfaces";
import { PrismaService } from "../../prisma/prisma.service";
import type { GradeCodeDto } from "./dto/grade-code.dto";
import type { RunCodeDto } from "./dto/run-code.dto";
import type { CandidateSubmitCodeDto, SubmitCodeDto } from "./dto/submit-code.dto";
import type {
  CodeExecutionStatus,
  CodeGradeResult,
  CodeLanguage,
  CodeQuestionSummary,
  CodeRunResult,
  CodeSubmitResult,
  CodeTestCaseResult,
} from "./types/code.types";

interface GradedRun {
  testResults: CodeTestCaseResult[];
  passedTestCases: number;
  totalTestCases: number;
  score: number;
  passed: boolean;
  status: CodeExecutionStatus;
  stdout: string;
  stderr: string;
  compileOutput: string;
  executionTime: number;
}

@Injectable()
export class CodeService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CodeExecutionService) private readonly executionService: CodeExecutionService,
  ) {}

  getQuestions(): CodeQuestionSummary[] {
    return CODE_QUESTIONS.map((question) => ({
      id: question.id,
      title: question.title,
      description: question.description,
      difficulty: question.difficulty,
      starterCode: question.starterCode,
      language: question.language,
      sampleInput: question.sampleInput,
      sampleOutput: question.sampleOutput,
      // Expose only the public sample. Hidden grading cases stay server-side so a
      // candidate cannot read expected outputs and hardcode them to pass.
      examples: [
        {
          input: question.sampleInput,
          expectedOutput: question.sampleOutput,
        },
      ],
      testCaseCount: question.testCases.length,
    }));
  }

  async runCode(dto: RunCodeDto): Promise<CodeRunResult> {
    this.assertSupportedLanguage(dto.language);

    return this.executionService.executeCode(dto.sourceCode, dto.stdin ?? "", dto.language as CodeLanguage);
  }

  async gradeCode(dto: GradeCodeDto): Promise<CodeGradeResult> {
    this.assertSupportedLanguage(dto.language);

    const question = this.findQuestionOrFail(dto.questionId);
    this.assertQuestionSupportsLanguage(question, dto.language);

    const graded = await this.gradeAgainstTestCases(question, dto.sourceCode, dto.language as CodeLanguage);

    return {
      questionId: question.id,
      passed: graded.passed,
      score: graded.score,
      totalTestCases: graded.totalTestCases,
      passedTestCases: graded.passedTestCases,
      status: graded.status,
      stdout: graded.stdout,
      stderr: graded.stderr,
      compileOutput: graded.compileOutput,
      testResults: graded.testResults,
    };
  }

  async submitCode(dto: SubmitCodeDto, access?: AccessContext): Promise<CodeSubmitResult> {
    this.assertSupportedLanguage(dto.language);

    const session = await this.findSessionOrFail(dto.sessionId, access);

    // A finished assessment must not accept further submissions.
    if (session.status === "COMPLETED") {
      throw new ConflictException("This session is already completed; no more submissions are accepted.");
    }

    const question = this.findQuestionOrFail(dto.questionId);
    this.assertQuestionSupportsLanguage(question, dto.language);

    const graded = await this.gradeAgainstTestCases(question, dto.sourceCode, dto.language as CodeLanguage);

    const submission = await this.prisma.codeSubmission.create({
      data: {
        sessionId: session.id,
        questionId: question.id,
        language: dto.language,
        sourceCode: dto.sourceCode,
        stdout: graded.stdout,
        stderr: graded.stderr,
        compileOutput: graded.compileOutput,
        status: graded.status,
        executionTime: graded.executionTime,
        score: graded.score,
        testResults: {
          passedTestCases: graded.passedTestCases,
          totalTestCases: graded.totalTestCases,
          results: graded.testResults,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      submissionId: submission.id,
      sessionId: session.id,
      questionId: question.id,
      stdout: graded.stdout,
      stderr: graded.stderr,
      compileOutput: graded.compileOutput,
      status: graded.status,
      executionTime: graded.executionTime,
      score: graded.score,
      totalTestCases: graded.totalTestCases,
      passedTestCases: graded.passedTestCases,
      testResults: graded.testResults,
    };
  }

  async listSubmissions(sessionId: string, access?: AccessContext) {
    await this.findSessionOrFail(sessionId, access);

    return this.prisma.codeSubmission.findMany({
      where: {
        sessionId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: DEFAULT_LIST_LIMIT,
    });
  }

  async getQuestionsByAccessCode(accessCode: string): Promise<CodeQuestionSummary[]> {
    await this.findOpenSessionByAccessCode(accessCode);
    return selectCandidateQuestions(this.getQuestions(), accessCode, 3);
  }

  async runCodeByAccessCode(accessCode: string, dto: RunCodeDto): Promise<CodeRunResult> {
    await this.findOpenSessionByAccessCode(accessCode);
    return this.runCode(dto);
  }

  async gradeCodeByAccessCode(accessCode: string, dto: GradeCodeDto) {
    await this.findOpenSessionByAccessCode(accessCode);
    this.assertQuestionAssignedToCandidate(accessCode, dto.questionId);
    return sanitizeCandidateGrade(await this.gradeCode(dto));
  }

  async submitCodeByAccessCode(accessCode: string, dto: CandidateSubmitCodeDto) {
    const session = await this.findOpenSessionByAccessCode(accessCode);
    this.assertQuestionAssignedToCandidate(accessCode, dto.questionId);
    return sanitizeCandidateGrade(await this.submitCode({ ...dto, sessionId: session.id }));
  }

  async listSubmissionsByAccessCode(accessCode: string) {
    const session = await this.findOpenSessionByAccessCode(accessCode);
    const submissions = await this.listSubmissions(session.id);
    return submissions.map((submission) => ({
      id: submission.id,
      sessionId: submission.sessionId,
      questionId: submission.questionId,
      language: submission.language,
      sourceCode: submission.sourceCode,
      stdout: submission.stdout,
      stderr: submission.stderr,
      compileOutput: submission.compileOutput,
      status: submission.status,
      executionTime: submission.executionTime,
      score: submission.score,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
    }));
  }

  private async gradeAgainstTestCases(question: CodeQuestion, sourceCode: string, language: CodeLanguage = "javascript"): Promise<GradedRun> {
    const testResults: CodeTestCaseResult[] = [];
    let firstError: CodeExecutionStatus | null = null;
    // Capture diagnostics from the first non-passing execution so a failing
    // submission surfaces the actual compiler/runtime error instead of "".
    let failureStdout: string | null = null;
    let failureStderr = "";
    let failureCompileOutput = "";
    let maxExecutionTime = 0;

    for (const testCase of question.testCases) {
      const execution = await this.executionService.executeCode(sourceCode, testCase.stdin, language);
      const passed =
        execution.status === "Accepted" &&
        this.normalizeOutput(execution.stdout) === this.normalizeOutput(testCase.expectedOutput);

      const status: CodeExecutionStatus = passed
        ? "Accepted"
        : execution.status === "Accepted"
          ? "Wrong Answer"
          : execution.status;

      if (!passed) {
        if (!firstError && status !== "Wrong Answer") {
          firstError = status;
        }

        if (failureStdout === null) {
          failureStdout = execution.stdout;
          failureStderr = execution.stderr;
          failureCompileOutput = execution.compileOutput;
        }
      }

      maxExecutionTime = Math.max(maxExecutionTime, execution.executionTime);

      testResults.push({
        stdin: testCase.stdin,
        expectedOutput: testCase.expectedOutput,
        actualOutput: execution.stdout,
        passed,
        status,
        executionTime: execution.executionTime,
      });
    }

    const passedTestCases = testResults.filter(({ passed }) => passed).length;
    const totalTestCases = testResults.length;
    const score = calculatePercentageScore(passedTestCases, totalTestCases);
    const passed = totalTestCases > 0 && passedTestCases === totalTestCases;
    const overallStatus: CodeExecutionStatus = passed ? "Accepted" : (firstError ?? "Wrong Answer");
    const first = testResults[0];

    return {
      testResults,
      passedTestCases,
      totalTestCases,
      score,
      passed,
      status: overallStatus,
      // On success show the first passing output; on failure surface the failing
      // run's stdout/stderr/compile output so the result is debuggable.
      stdout: passed ? (first?.actualOutput ?? "") : (failureStdout ?? first?.actualOutput ?? ""),
      stderr: failureStderr,
      compileOutput: failureCompileOutput,
      executionTime: maxExecutionTime,
    };
  }

  private assertSupportedLanguage(language: string): void {
    if (!(SUPPORTED_CODE_LANGUAGES as readonly string[]).includes(language)) {
      throw new BadRequestException(
        `Unsupported language: ${language}. Supported: ${SUPPORTED_CODE_LANGUAGES.join(", ")}.`,
      );
    }
  }

  /**
   * Grading compares stdout against fixed expected output, so a candidate may
   * solve in any language the sandbox supports — the question's own `language`
   * only decides which starter template is offered.
   */
  private assertQuestionSupportsLanguage(_question: CodeQuestion, language: string): void {
    this.assertSupportedLanguage(language);
  }

  private async findSessionOrFail(sessionId: string, access?: AccessContext): Promise<SessionSnapshot> {
    const session = access
      ? await this.prisma.interviewSession.findFirst({
          where: { id: sessionId, ...buildSessionOwnershipWhere(access) },
          select: {
            id: true,
            status: true,
            expiresAt: true,
          },
        })
      : await this.prisma.interviewSession.findUnique({
          where: { id: sessionId },
          select: {
            id: true,
            status: true,
            expiresAt: true,
          },
        });

    if (!session) {
      throw new NotFoundException("Session not found or access denied.");
    }

    this.assertSessionNotExpired(session);
    return session;
  }

  private async findOpenSessionByAccessCode(accessCode: string): Promise<SessionSnapshot> {
    const session = await this.prisma.interviewSession.findFirst({
      where: { accessCode: normalizeAccessCode(accessCode) },
      select: {
        id: true,
        status: true,
        expiresAt: true,
      },
    });

    if (!session) {
      throw new NotFoundException("Session not found.");
    }

    this.assertSessionNotExpired(session);
    if (session.status !== "IN_PROGRESS") {
      throw new ConflictException("Start the assessment before opening the coding workspace.");
    }

    return session;
  }

  private assertSessionNotExpired(session: SessionSnapshot): void {
    if (session.status === "EXPIRED") {
      throw new GoneException("Session has expired.");
    }

    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
      throw new GoneException("Session has expired.");
    }
  }

  private assertQuestionAssignedToCandidate(accessCode: string, questionId: string): void {
    const assigned = selectCandidateQuestions(this.getQuestions(), accessCode, 3);
    if (!assigned.some((question) => question.id === questionId)) {
      throw new BadRequestException("Coding question is not assigned to this session.");
    }
  }

  private findQuestionOrFail(questionId: string): CodeQuestion {
    const question = CODE_QUESTION_INDEX.get(questionId);

    if (!question) {
      throw new NotFoundException("Coding question not found.");
    }

    return question;
  }

  private normalizeOutput(value: string): string {
    return value.replace(/\r\n/g, "\n").trimEnd();
  }
}

function selectCandidateQuestions(
  questions: CodeQuestionSummary[],
  accessCode: string,
  limit: number,
): CodeQuestionSummary[] {
  if (questions.length <= limit) return questions;
  const selected: CodeQuestionSummary[] = [];

  for (const difficulty of ["easy", "medium", "hard"] as const) {
    const candidates = questions.filter((question) => question.difficulty === difficulty);
    if (!candidates.length || selected.length >= limit) continue;
    selected.push(candidates[stableIndex(`${accessCode}:${difficulty}`, candidates.length)]);
  }

  const remaining = questions.filter(
    (question) => !selected.some((candidate) => candidate.id === question.id),
  );
  const offset = stableIndex(accessCode, Math.max(remaining.length, 1));
  for (let index = 0; selected.length < limit && index < remaining.length; index += 1) {
    selected.push(remaining[(offset + index) % remaining.length]);
  }

  return selected;
}

function stableIndex(seed: string, length: number): number {
  let hash = 2_166_136_261;
  for (const character of seed.toUpperCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % length;
}

export function calculatePercentageScore(passedTestCases: number, totalTestCases: number): number {
  if (totalTestCases <= 0) return 0;
  const boundedPassed = Math.max(0, Math.min(passedTestCases, totalTestCases));
  return Math.round((boundedPassed / totalTestCases) * 100);
}

function normalizeAccessCode(accessCode: string): string {
  const normalized = accessCode.trim().toUpperCase();
  if (!normalized) throw new BadRequestException("Access code is required.");
  return normalized;
}

function sanitizeCandidateGrade<T extends CodeGradeResult | CodeSubmitResult>(result: T) {
  return {
    ...result,
    testResults: result.testResults.map((test, index) => ({
      case: index + 1,
      passed: test.passed,
      status: test.status,
      executionTime: test.executionTime,
    })),
  };
}
