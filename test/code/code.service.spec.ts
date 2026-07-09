import { ConflictException, GoneException, NotFoundException } from "@nestjs/common";
import { CODE_QUESTIONS } from "../../src/modules/code/constants/code.constants";
import { CodeService } from "../../src/modules/code/code.service";
import { PistonService } from "../../src/modules/code/piston.service";
import { PrismaService } from "../../src/modules/code/prisma.service";

describe("CodeService", () => {
  const prismaMock = {
    interviewSession: {
      findUnique: jest.fn(),
    },
    codeSubmission: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;

  const pistonService = {
    executeCode: jest.fn(),
  } as unknown as PistonService;

  const service = new CodeService(prismaMock, pistonService);

  beforeEach(() => {
    jest.clearAllMocks();
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

  it("runs code through the Piston sandbox", async () => {
    (pistonService.executeCode as jest.Mock).mockResolvedValue({
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

    expect(pistonService.executeCode).toHaveBeenCalledWith("console.log('hello')", "");
    expect(result.status).toBe("Accepted");
  });

  it("stores a submission after evaluating test cases", async () => {
    (prismaMock.interviewSession.findUnique as jest.Mock).mockResolvedValue({
      id: "session-1",
      status: "IN_PROGRESS",
      expiresAt: null,
    });
    // A correct solution: echo the sum of the two space-separated integers from stdin.
    (pistonService.executeCode as jest.Mock).mockImplementation((_source: string, stdin: string) => {
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
    (pistonService.executeCode as jest.Mock).mockResolvedValue({
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
    expect(pistonService.executeCode).not.toHaveBeenCalled();
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
    });
    expect(result).toBe(rows);
  });

  it("does not list submissions for an unknown session", async () => {
    (prismaMock.interviewSession.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.listSubmissions("nope")).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.codeSubmission.findMany).not.toHaveBeenCalled();
  });

  it("surfaces stderr and compile output when a graded run fails", async () => {
    (pistonService.executeCode as jest.Mock).mockResolvedValue({
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
    expect(pistonService.executeCode).not.toHaveBeenCalled();
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
