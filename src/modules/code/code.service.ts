import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CODE_QUESTION_INDEX, CODE_QUESTIONS } from "./constants/code.constants";
import type { CodeQuestion, SessionSnapshot } from "./interfaces/code.interfaces";
import { PistonService } from "./piston.service";
import { PrismaService } from "./prisma.service";
import type { GradeCodeDto } from "./dto/grade-code.dto";
import type { RunCodeDto } from "./dto/run-code.dto";
import type { SubmitCodeDto } from "./dto/submit-code.dto";
import type {
  CodeExecutionStatus,
  CodeGradeResult,
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
    @Inject(PistonService) private readonly pistonService: PistonService,
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

    return this.pistonService.executeCode(dto.sourceCode, dto.stdin ?? "");
  }

  async gradeCode(dto: GradeCodeDto): Promise<CodeGradeResult> {
    this.assertSupportedLanguage(dto.language);

    const question = this.findQuestionOrFail(dto.questionId);
    this.assertQuestionSupportsLanguage(question, dto.language);

    const graded = await this.gradeAgainstTestCases(question, dto.sourceCode);

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

  async submitCode(dto: SubmitCodeDto): Promise<CodeSubmitResult> {
    this.assertSupportedLanguage(dto.language);

    const session = await this.findSessionOrFail(dto.sessionId);

    // A finished assessment must not accept further submissions.
    if (session.status === "COMPLETED") {
      throw new ConflictException("This session is already completed; no more submissions are accepted.");
    }

    const question = this.findQuestionOrFail(dto.questionId);
    this.assertQuestionSupportsLanguage(question, dto.language);

    const graded = await this.gradeAgainstTestCases(question, dto.sourceCode);

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

  async listSubmissions(sessionId: string) {
    await this.findSessionOrFail(sessionId);

    return this.prisma.codeSubmission.findMany({
      where: {
        sessionId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  private async gradeAgainstTestCases(question: CodeQuestion, sourceCode: string): Promise<GradedRun> {
    const testResults: CodeTestCaseResult[] = [];
    let firstError: CodeExecutionStatus | null = null;
    // Capture diagnostics from the first non-passing execution so a failing
    // submission surfaces the actual compiler/runtime error instead of "".
    let failureStdout: string | null = null;
    let failureStderr = "";
    let failureCompileOutput = "";
    let maxExecutionTime = 0;

    for (const testCase of question.testCases) {
      const execution = await this.pistonService.executeCode(sourceCode, testCase.stdin);
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
    const score = totalTestCases === 0 ? 0 : Math.round((passedTestCases / totalTestCases) * 100);
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
    if (language !== "javascript") {
      throw new BadRequestException(`Unsupported language: ${language}`);
    }
  }

  private assertQuestionSupportsLanguage(question: CodeQuestion, language: string): void {
    if (question.language !== language) {
      throw new BadRequestException("The selected question does not support the requested language.");
    }
  }

  private async findSessionOrFail(sessionId: string): Promise<SessionSnapshot> {
    const session = await this.prisma.interviewSession.findUnique({
      where: {
        id: sessionId,
      },
      select: {
        id: true,
        status: true,
        expiresAt: true,
      },
    });

    if (!session) {
      throw new NotFoundException("Session not found.");
    }

    if (session.status === "EXPIRED") {
      throw new GoneException("Session has expired.");
    }

    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
      throw new GoneException("Session has expired.");
    }

    return session;
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
