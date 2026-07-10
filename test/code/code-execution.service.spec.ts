import { BadRequestException } from "@nestjs/common";
import { CodeExecutionService } from "../../src/modules/code/code-execution.service";
import { Judge0Service } from "../../src/modules/code/judge0.service";
import { PistonService } from "../../src/modules/code/piston.service";

describe("CodeExecutionService", () => {
  const originalEnv = { ...process.env };
  const judge0 = { executeCode: jest.fn() } as unknown as Judge0Service;
  const piston = { executeCode: jest.fn() } as unknown as PistonService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.CODE_EXECUTION_PROVIDER;
    delete process.env.PISTON_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults to Judge0 when Piston is not explicitly configured", async () => {
    (judge0.executeCode as jest.Mock).mockResolvedValue({ status: "Accepted" });
    await new CodeExecutionService(judge0, piston).executeCode("source", "stdin");
    expect(judge0.executeCode).toHaveBeenCalledWith("source", "stdin");
    expect(piston.executeCode).not.toHaveBeenCalled();
  });

  it("uses Piston when selected", async () => {
    process.env.CODE_EXECUTION_PROVIDER = "piston";
    (piston.executeCode as jest.Mock).mockResolvedValue({ status: "Accepted" });
    await new CodeExecutionService(judge0, piston).executeCode("source");
    expect(piston.executeCode).toHaveBeenCalled();
  });

  it("rejects unknown providers", () => {
    process.env.CODE_EXECUTION_PROVIDER = "unsafe";
    expect(() => new CodeExecutionService(judge0, piston).executeCode("source"))
      .toThrow(BadRequestException);
  });
});
