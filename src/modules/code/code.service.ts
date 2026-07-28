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

interface CandidateCodingQuestionRow {
  id: string;
  questionType: string;
  options: Prisma.JsonValue | null;
}

interface CandidateCodingSession extends SessionSnapshot {
  template: {
    modules: Array<{
      id: string;
      questions: CandidateCodingQuestionRow[];
    }>;
  };
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
    return this.storeSubmission(session.id, question, dto, graded);
  }

  private async storeSubmission(
    sessionId: string,
    question: CodeQuestion,
    dto: Pick<SubmitCodeDto, "language" | "sourceCode">,
    graded: GradedRun,
  ): Promise<CodeSubmitResult> {
    const submission = await this.prisma.codeSubmission.create({
      data: {
        sessionId,
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
      sessionId,
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
    const session = await this.findOpenSessionByAccessCode(accessCode);
    return this.assignedQuestionSummaries(session, accessCode);
  }

  async runCodeByAccessCode(accessCode: string, dto: RunCodeDto): Promise<CodeRunResult> {
    await this.findOpenSessionByAccessCode(accessCode);
    return this.runCode(dto);
  }

  async gradeCodeByAccessCode(accessCode: string, dto: GradeCodeDto) {
    const session = await this.findOpenSessionByAccessCode(accessCode);
    const question = this.findAssignedQuestionOrFail(session, accessCode, dto.questionId);
    this.assertSupportedLanguage(dto.language);
    const graded = await this.gradeAgainstTestCases(question, dto.sourceCode, dto.language as CodeLanguage);
    return sanitizeCandidateGrade({
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
    });
  }

  async submitCodeByAccessCode(accessCode: string, dto: CandidateSubmitCodeDto) {
    const session = await this.findOpenSessionByAccessCode(accessCode);
    const question = this.findAssignedQuestionOrFail(session, accessCode, dto.questionId);
    this.assertSupportedLanguage(dto.language);
    const graded = await this.gradeAgainstTestCases(question, dto.sourceCode, dto.language as CodeLanguage);
    return sanitizeCandidateGrade(await this.storeSubmission(session.id, question, dto, graded));
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
    // Test cases are independent. Running them concurrently avoids making the
    // candidate wait for one complete remote sandbox round trip per case.
    const executions = await Promise.all(question.testCases.map((testCase) =>
      this.executionService.executeCode(sourceCode, testCase.stdin, language),
    ));
    const testResults: CodeTestCaseResult[] = question.testCases.map((testCase, index) => {
      const execution = executions[index];
      const passed =
        execution.status === "Accepted" &&
        this.normalizeOutput(execution.stdout) === this.normalizeOutput(testCase.expectedOutput);

      const status: CodeExecutionStatus = passed
        ? "Accepted"
        : execution.status === "Accepted"
          ? "Wrong Answer"
          : execution.status;

      return {
        stdin: testCase.stdin,
        expectedOutput: testCase.expectedOutput,
        actualOutput: execution.stdout,
        passed,
        status,
        executionTime: execution.executionTime,
      };
    });

    const passedTestCases = testResults.filter(({ passed }) => passed).length;
    const totalTestCases = testResults.length;
    const score = calculatePercentageScore(passedTestCases, totalTestCases);
    const passed = totalTestCases > 0 && passedTestCases === totalTestCases;
    const firstRuntimeFailure = testResults.find(({ status }) => status !== "Accepted" && status !== "Wrong Answer");
    const overallStatus: CodeExecutionStatus = passed ? "Accepted" : (firstRuntimeFailure?.status ?? "Wrong Answer");
    const first = testResults[0];
    const firstFailureIndex = testResults.findIndex(({ passed: testPassed }) => !testPassed);
    const firstFailureExecution = firstFailureIndex >= 0 ? executions[firstFailureIndex] : undefined;

    return {
      testResults,
      passedTestCases,
      totalTestCases,
      score,
      passed,
      status: overallStatus,
      // On success show the first passing output; on failure surface the failing
      // run's stdout/stderr/compile output so the result is debuggable.
      stdout: passed ? (first?.actualOutput ?? "") : (firstFailureExecution?.stdout ?? first?.actualOutput ?? ""),
      stderr: firstFailureExecution?.stderr ?? "",
      compileOutput: firstFailureExecution?.compileOutput ?? "",
      executionTime: executions.reduce((maximum, execution) => Math.max(maximum, execution.executionTime), 0),
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

  private async findOpenSessionByAccessCode(accessCode: string): Promise<CandidateCodingSession> {
    const session = await this.prisma.interviewSession.findFirst({
      where: { accessCode: normalizeAccessCode(accessCode) },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        template: {
          select: {
            modules: {
              where: { moduleType: "CODING" },
              orderBy: { orderIndex: "asc" },
              select: {
                id: true,
                questions: {
                  where: { questionType: "CODING" },
                  select: { id: true, questionType: true, options: true },
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException("Session not found.");
    }

    this.assertSessionNotExpired(session);
    if (session.status !== "IN_PROGRESS") {
      throw new ConflictException("Start the assessment before opening the coding workspace.");
    }

    return session as CandidateCodingSession;
  }

  private assertSessionNotExpired(session: SessionSnapshot): void {
    if (session.status === "EXPIRED") {
      throw new GoneException("Session has expired.");
    }

    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
      throw new GoneException("Session has expired.");
    }
  }

  private assignedQuestionSummaries(session: CandidateCodingSession, accessCode: string): CodeQuestionSummary[] {
    const authoredQuestions = session.template.modules.flatMap((module) => module.questions);
    const templateQuestions = authoredQuestions.length
      ? authoredQuestions
      : session.template.modules.slice(0, 1).flatMap((module) =>
          [0, 1, 2].map((index) => ({
            id: `${module.id}:legacy-slot-${index}`,
            questionType: "CODING",
            options: null,
          })),
        );
    const assignedIds = selectTemplateQuestionIds(
      this.getQuestions(),
      templateQuestions,
      accessCode,
    );
    const summaries = new Map(this.getQuestions().map((question) => [question.id, question]));
    return assignedIds.map((id) => summaries.get(id)).filter((question): question is CodeQuestionSummary => Boolean(question));
  }

  private findAssignedQuestionOrFail(
    session: CandidateCodingSession,
    accessCode: string,
    questionId: string,
  ): CodeQuestion {
    if (!this.assignedQuestionSummaries(session, accessCode).some((question) => question.id === questionId)) {
      throw new BadRequestException("Coding question is not assigned to this session.");
    }
    return this.findQuestionOrFail(questionId);
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

export function selectTemplateQuestionIds(
  questions: CodeQuestionSummary[],
  templateQuestions: CandidateCodingQuestionRow[],
  accessCode: string,
): string[] {
  const availableIds = new Set(questions.map((question) => question.id));
  const selected: string[] = [];

  for (const [index, templateQuestion] of templateQuestions.entries()) {
    const configuredId = readCodeQuestionId(templateQuestion.options);
    if (configuredId && availableIds.has(configuredId) && !selected.includes(configuredId)) {
      selected.push(configuredId);
      continue;
    }

    // Templates created before challenge selection existed still receive a
    // stable, unique executable challenge for each coding question.
    const remaining = questions.filter((question) => !selected.includes(question.id));
    if (!remaining.length) break;
    const difficulty = (["easy", "medium", "hard"] as const)[index % 3];
    const preferred = remaining.filter((question) => question.difficulty === difficulty);
    const pool = preferred.length ? preferred : remaining;
    selected.push(pool[stableIndex(`${accessCode}:${templateQuestion.id}`, pool.length)].id);
  }

  return selected;
}

function readCodeQuestionId(options: Prisma.JsonValue | null): string | undefined {
  if (!options || typeof options !== "object" || Array.isArray(options)) return undefined;
  const value = (options as Prisma.JsonObject).codeQuestionId;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
