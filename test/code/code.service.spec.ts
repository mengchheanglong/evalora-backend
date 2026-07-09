import { GoneException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { CODE_QUESTIONS } from "../../src/modules/code/constants/code.constants";
import { CodeService } from "../../src/modules/code/code.service";
import { Judge0Service } from "../../src/modules/code/judge0.service";

describe("CodeService", () => {
  const prismaMock = {
    interviewSession: {
      findUnique: jest.fn(),
    },
    codeSubmission: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  } as unknown as PrismaClient;

  const judge0Service = {
    executeCode: jest.fn(),
  } as unknown as Judge0Service;

  const service = new CodeService(prismaMock, judge0Service);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the available coding questions", () => {
    const questions = service.getQuestions();

    expect(questions).toHaveLength(CODE_QUESTIONS.length);
    expect(questions[0]).not.toHaveProperty("testCases");
    expect(questions[0]).toMatchObject({
      id: "sum-two-numbers",
      language: "javascript",
    });
  });

  it("runs code through Judge0", async () => {
    (judge0Service.executeCode as jest.Mock).mockResolvedValue({
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

    expect(judge0Service.executeCode).toHaveBeenCalledWith({
      language: "javascript",
      sourceCode: "console.log('hello')",
      stdin: "",
    });
    expect(result.status).toBe("Accepted");
  });

  it("stores a submission after evaluating test cases", async () => {
    (prismaMock.interviewSession.findUnique as jest.Mock).mockResolvedValue({
      id: "session-1",
      status: "IN_PROGRESS",
      expiresAt: null,
    });
    (judge0Service.executeCode as jest.Mock)
      .mockResolvedValueOnce({
        stdout: "5\n",
        stderr: "",
        compileOutput: "",
        status: "Accepted",
        executionTime: 0.05,
      })
      .mockResolvedValueOnce({
        stdout: "6\n",
        stderr: "",
        compileOutput: "",
        status: "Accepted",
        executionTime: 0.05,
      });
    (prismaMock.codeSubmission.create as jest.Mock).mockResolvedValue({ id: "submission-1" });

    const result = await service.submitCode({
      sessionId: "session-1",
      questionId: "sum-two-numbers",
      language: "javascript",
      sourceCode: "console.log(5)",
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