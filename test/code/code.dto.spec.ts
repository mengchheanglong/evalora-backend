import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { MAX_SOURCE_CODE_LENGTH } from "../../src/modules/code/constants/code.constants";
import { RunCodeDto } from "../../src/modules/code/dto/run-code.dto";
import { SubmitCodeDto } from "../../src/modules/code/dto/submit-code.dto";

describe("Code DTO validation", () => {
  it("accepts a valid run payload", () => {
    const dto = plainToInstance(RunCodeDto, {
      language: "javascript",
      sourceCode: "console.log('Hello')",
      stdin: "",
    });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it("rejects an unsupported language", () => {
    const dto = plainToInstance(RunCodeDto, {
      language: "python",
      sourceCode: "print('Hello')",
    });

    const errors = validateSync(dto);

    expect(errors.some((error) => error.property === "language")).toBe(true);
  });

  it("requires session and question identifiers for submissions", () => {
    const dto = plainToInstance(SubmitCodeDto, {
      language: "javascript",
      sourceCode: "console.log('Hello')",
    });

    const errors = validateSync(dto);

    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(["sessionId", "questionId"]));
  });

  it("rejects source code that exceeds the maximum length", () => {
    const dto = plainToInstance(RunCodeDto, {
      language: "javascript",
      sourceCode: "a".repeat(MAX_SOURCE_CODE_LENGTH + 1),
    });

    const errors = validateSync(dto);

    expect(errors.some((error) => error.property === "sourceCode")).toBe(true);
  });
});