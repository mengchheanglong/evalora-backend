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
});