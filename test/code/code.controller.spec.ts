import { CodeController } from "../../src/modules/code/code.controller";

describe("CodeController", () => {
  it("delegates run requests to the service", async () => {
    const codeService = {
      runCode: jest.fn().mockResolvedValue({ stdout: "ok", stderr: "", compileOutput: "", status: "Accepted", executionTime: 0.01 }),
      submitCode: jest.fn(),
      getQuestions: jest.fn(),
      listSubmissions: jest.fn(),
    };

    const controller = new CodeController(codeService as never);
    const result = await controller.run({ language: "javascript", sourceCode: "console.log('ok')", stdin: "" });

    expect(codeService.runCode).toHaveBeenCalledWith({ language: "javascript", sourceCode: "console.log('ok')", stdin: "" });
    expect(result).toEqual({ stdout: "ok", stderr: "", compileOutput: "", status: "Accepted", executionTime: 0.01 });
  });

  it("delegates submit requests to the service", async () => {
    const codeService = {
      runCode: jest.fn(),
      submitCode: jest.fn().mockResolvedValue({ submissionId: "submission-1" }),
      getQuestions: jest.fn(),
      listSubmissions: jest.fn(),
    };

    const controller = new CodeController(codeService as never);
    const result = await controller.submit({
      sessionId: "session-1",
      questionId: "sum-two-numbers",
      language: "javascript",
      sourceCode: "console.log(1)",
    });

    expect(codeService.submitCode).toHaveBeenCalledWith({
      sessionId: "session-1",
      questionId: "sum-two-numbers",
      language: "javascript",
      sourceCode: "console.log(1)",
    });
    expect(result).toEqual({ submissionId: "submission-1" });
  });

  it("delegates grade requests to the service", async () => {
    const codeService = {
      runCode: jest.fn(),
      gradeCode: jest.fn().mockResolvedValue({ questionId: "sum-two-numbers", score: 100 }),
      submitCode: jest.fn(),
      getQuestions: jest.fn(),
      listSubmissions: jest.fn(),
    };

    const controller = new CodeController(codeService as never);
    const result = await controller.grade({
      questionId: "sum-two-numbers",
      language: "javascript",
      sourceCode: "console.log(1)",
    });

    expect(codeService.gradeCode).toHaveBeenCalledWith({
      questionId: "sum-two-numbers",
      language: "javascript",
      sourceCode: "console.log(1)",
    });
    expect(result).toEqual({ questionId: "sum-two-numbers", score: 100 });
  });

  it("exposes the question bank via the service", () => {
    const questions = [{ id: "sum-two-numbers" }];
    const codeService = {
      runCode: jest.fn(),
      submitCode: jest.fn(),
      getQuestions: jest.fn().mockReturnValue(questions),
      listSubmissions: jest.fn(),
    };

    const controller = new CodeController(codeService as never);

    expect(controller.questions()).toBe(questions);
    expect(codeService.getQuestions).toHaveBeenCalledTimes(1);
  });

  it("delegates submission listing to the service with the session id", async () => {
    const rows = [{ id: "sub-1" }];
    const codeService = {
      runCode: jest.fn(),
      submitCode: jest.fn(),
      getQuestions: jest.fn(),
      listSubmissions: jest.fn().mockResolvedValue(rows),
    };

    const controller = new CodeController(codeService as never);
    const result = await controller.submissions("session-1");

    expect(codeService.listSubmissions).toHaveBeenCalledWith("session-1");
    expect(result).toBe(rows);
  });
});