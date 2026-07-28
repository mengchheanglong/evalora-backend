import { ConflictException, GoneException, NotFoundException } from "@nestjs/common";
import { CodeExecutionService } from "../../src/modules/code/code-execution.service";
import { CODE_QUESTIONS } from "../../src/modules/code/constants/code.constants";
import {
  calculatePercentageScore,
  CodeService,
  selectTemplateQuestionIds,
} from "../../src/modules/code/code.service";
import { PrismaService } from "../../src/prisma/prisma.service";

describe("CodeService", () => {
  const prismaMock = {
    interviewSession: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    codeSubmission: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;

  const executionService = {
    executeCode: jest.fn(),
  } as unknown as CodeExecutionService;

  const service = new CodeService(prismaMock, executionService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    [0, 4, 0],
    [1, 4, 25],
    [2, 4, 50],
    [4, 5, 80],
    [5, 5, 100],
  ])("calculates %i of %i passed tests as %i%%", (passed, total, expected) => {
    expect(calculatePercentageScore(passed, total)).toBe(expected);
  });

  it("returns the available coding questions without leaking hidden test cases", () => {
    const questions = service.getQuestions();

    expect(questions).toHaveLength(CODE_QUESTIONS.length);

    const [first] = questions;
    expect(first).not.toHaveProperty("testCases");
    expect(first).toMatchObject({ id: "sum-two-numbers", language: "javascript" });

    const source = CODE_QUESTIONS[0];
    // Only the public sample is exposed, never the hidden grading cases.
    expect(first.examples).toEqual([
      { input: source.sampleInput, expectedOutput: source.sampleOutput },
    ]);
    expect(first.testCaseCount).toBe(source.testCases.length);

    const hiddenInputs = source.testCases.map((testCase) => testCase.stdin);
    const exposedInputs = questions.flatMap((question) =>
      question.examples.map((example) => example.input),
    );
    expect(exposedInputs).not.toEqual(expect.arrayContaining(hiddenInputs));
  });

  it("uses configured template challenges and assigns stable fallbacks to legacy questions", () => {
    const questions = service.getQuestions();
    const assigned = selectTemplateQuestionIds(
      questions,
      [
        {
          id: "configured",
          questionType: "CODING",
          options: { codeQuestionId: "sum-two-numbers" },
        },
        {
          id: "legacy",
          questionType: "CODING",
          options: null,
        },
      ],
      "EV-TEST",
    );

    expect(assigned).toHaveLength(2);
    expect(assigned[0]).toBe("sum-two-numbers");
    expect(assigned[1]).not.toBe("sum-two-numbers");
    expect(selectTemplateQuestionIds(questions, [
      { id: "configured", questionType: "CODING", options: { codeQuestionId: "sum-two-numbers" } },
      { id: "legacy", questionType: "CODING", options: null },
    ], "EV-TEST")).toEqual(assigned);
  });

  it("returns only the challenges configured by the session template", async () => {
    (prismaMock.interviewSession.findFirst as jest.Mock).mockResolvedValue({
      id: "session-1",
      status: "IN_PROGRESS",
      expiresAt: null,
      template: {
        modules: [{
          id: "coding-module",
          questions: [{
            id: "template-question",
            questionType: "CODING",
            options: { codeQuestionId: "palindrome" },
          }],
        }],
      },
    });

    const questions = await service.getQuestionsByAccessCode("EV-TEST");

    expect(questions.map((question) => question.id)).toEqual(["palindrome"]);
  });

  it("keeps legacy zero-question coding modules usable with three stable challenges", async () => {
    (prismaMock.interviewSession.findFirst as jest.Mock).mockResolvedValue({
      id: "session-1",
      status: "IN_PROGRESS",
      expiresAt: null,
      template: {
        modules: [{ id: "legacy-coding-module", questions: [] }],
      },
    });

    const questions = await service.getQuestionsByAccessCode("EV-LEGACY");

    expect(questions).toHaveLength(3);
    expect(new Set(questions.map((question) => question.id))).toHaveProperty("size", 3);
  });

  it("runs code through the configured execution sandbox", async () => {
    (executionService.executeCode as jest.Mock).mockResolvedValue({
      stdout: "hello\n",
      stderr: "",
      compileOutput: "",
      status: "Accepted",
      executionTime: 0.05,
    });

    const result = await service.runCode({
      language: "javascript",
      sourceCode: "console.log('hello')",
      stdin: "",
    });

    expect(executionService.executeCode).toHaveBeenCalledWith("console.log('hello')", "", "javascript");
    expect(result.status).toBe("Accepted");
  });

  it("runs and grades a candidate solution written in another supported language", async () => {
    (executionService.executeCode as jest.Mock).mockImplementation((_source: string, stdin: string) => {
      const [a, b] = stdin.split(" ").map(Number);
      return Promise.resolve({ stdout: `${a + b}
`, stderr: "", compileOutput: "", status: "Accepted", executionTime: 0.03 });
    });

    // The question ships a JavaScript starter, but grading compares stdout — so a
    // Python solution must be accepted and executed with the Python runtime.
    const result = await service.gradeCode({
      questionId: "sum-two-numbers",
      language: "python",
      sourceCode: "a,b=input().split(); print(int(a)+int(b))",
    });

    expect(result.score).toBe(100);
    expect(executionService.executeCode).toHaveBeenCalledWith(expect.any(String), expect.any(String), "python");
  });

  it("stores a submission after evaluating test cases", async () => {
    (prismaMock.interviewSession.findUnique as jest.Mock).mockResolvedValue({
      id: "session-1",
      status: "IN_PROGRESS",
      expiresAt: null,
    });
    // A correct solution: echo the sum of the two space-separated integers from stdin.
    (executionService.executeCode as jest.Mock).mockImplementation((_source: string, stdin: string) => {
      const [a, b] = stdin.split(" ").map(Number);
      return Promise.resolve({
        stdout: `${a + b}\n`,
        stderr: "",
        compileOutput: "",
        status: "Accepted",
        executionTime: 0.05,
      });
    });
    (prismaMock.codeSubmission.create as jest.Mock).mockResolvedValue({ id: "submission-1" });

    const result = await service.submitCode({
      sessionId: "session-1",
      questionId: "sum-two-numbers",
      language: "javascript",
      sourceCode: "console.log(6)",
    });

    expect(prismaMock.codeSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: "session-1",
          questionId: "sum-two-numbers",
          score: 100,
        }),
      }),
    );
    expect(result.score).toBe(100);
    expect(result.totalTestCases).toBeGreaterThan(0);
  });

  it("reports a partial score and Wrong Answer when only some cases pass", async () => {
    // Always echo "6\n": correct for the first sum-two-numbers case (10 + -4), wrong for the rest.
    (executionService.executeCode as jest.Mock).mockResolvedValue({
      stdout: "6\n",
      stderr: "",
      compileOutput: "",
      status: "Accepted",
      executionTime: 0.01,
    });

    const result = await service.gradeCode({
      questionId: "sum-two-numbers",
      language: "javascript",
      sourceCode: "console.log(6)",
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe("Wrong Answer");
    expect(result.passedTestCases).toBe(1);
    expect(result.totalTestCases).toBe(3);
    expect(result.score).toBe(33);
    expect(result.testResults.filter((t) => t.passed)).toHaveLength(1);
  });

  it("starts independent hidden test executions without waiting for the previous case", async () => {
    const resolvers: Array<() => void> = [];
    (executionService.executeCode as jest.Mock).mockImplementation(() =>
      new Promise((resolve) => {
        resolvers.push(() => resolve({
          stdout: "",
          stderr: "",
          compileOutput: "",
          status: "Accepted",
          executionTime: 0.01,
        }));
      }),
    );

    const grading = service.gradeCode({
      questionId: "sum-two-numbers",
      language: "javascript",
      sourceCode: "console.log(0)",
    });

    await Promise.resolve();
    expect(executionService.executeCode).toHaveBeenCalledTimes(3);
    resolvers.forEach((resolve) => resolve());
    await grading;
  });

  it("rejects submissions once the session's expiresAt is in the past", async () => {
    (prismaMock.interviewSession.findUnique as jest.Mock).mockResolvedValue({
      id: "session-1",
      status: "IN_PROGRESS",
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      service.submitCode({
        sessionId: "session-1",
        questionId: "sum-two-numbers",
        language: "javascript",
        sourceCode: "console.log(6)",
      }),
    ).rejects.toBeInstanceOf(GoneException);
    expect(executionService.executeCode).not.toHaveBeenCalled();
  });

  it("lists submissions for a session in newest-first order after validating it exists", async () => {
    (prismaMock.interviewSession.findUnique as jest.Mock).mockResolvedValue({
      id: "session-1",
      status: "COMPLETED",
      expiresAt: null,
    });
    const rows = [{ id: "sub-2" }, { id: "sub-1" }];
    (prismaMock.codeSubmission.findMany as jest.Mock).mockResolvedValue(rows);

    const result = await service.listSubmissions("session-1");

    expect(prismaMock.interviewSession.findUnique).toHaveBeenCalled();
    expect(prismaMock.codeSubmission.findMany).toHaveBeenCalledWith({
      where: { sessionId: "session-1" },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    expect(result).toBe(rows);
  });

  it("does not list submissions for an unknown session", async () => {
    (prismaMock.interviewSession.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.listSubmissions("nope")).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.codeSubmission.findMany).not.toHaveBeenCalled();
  });

  it("surfaces stderr and compile output when a graded run fails", async () => {
    (executionService.executeCode as jest.Mock).mockResolvedValue({
      stdout: "",
      stderr: "ReferenceError: x is not defined",
      compileOutput: "",
      status: "Runtime Error",
      executionTime: 0.02,
    });

    const result = await service.gradeCode({
      questionId: "sum-two-numbers",
      language: "javascript",
      sourceCode: "console.log(x)",
    });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.status).toBe("Runtime Error");
    expect(result.stderr).toContain("ReferenceError");
  });

  it("rejects expired sessions", async () => {
    (prismaMock.interviewSession.findUnique as jest.Mock).mockResolvedValue({
      id: "session-1",
      status: "EXPIRED",
      expiresAt: null,
    });

    await expect(
      service.submitCode({
        sessionId: "session-1",
        questionId: "sum-two-numbers",
        language: "javascript",
        sourceCode: "console.log(1)",
      }),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it("rejects submissions to an already completed session without executing code", async () => {
    (prismaMock.interviewSession.findUnique as jest.Mock).mockResolvedValue({
      id: "session-1",
      status: "COMPLETED",
      expiresAt: null,
    });

    await expect(
      service.submitCode({
        sessionId: "session-1",
        questionId: "sum-two-numbers",
        language: "javascript",
        sourceCode: "console.log(6)",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(executionService.executeCode).not.toHaveBeenCalled();
    expect(prismaMock.codeSubmission.create).not.toHaveBeenCalled();
  });

  it("rejects missing questions", async () => {
    (prismaMock.interviewSession.findUnique as jest.Mock).mockResolvedValue({
      id: "session-1",
      status: "IN_PROGRESS",
      expiresAt: null,
    });

    await expect(
      service.submitCode({
        sessionId: "session-1",
        questionId: "missing-question",
        language: "javascript",
        sourceCode: "console.log(1)",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
