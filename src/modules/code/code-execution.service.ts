import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Judge0Service } from "./judge0.service";
import { PistonService } from "./piston.service";
import type { CodeLanguage, CodeRunResult } from "./types/code.types";

type ExecutionProvider = "judge0" | "piston";

@Injectable()
export class CodeExecutionService {
  constructor(
    @Inject(Judge0Service) private readonly judge0: Judge0Service,
    @Inject(PistonService) private readonly piston: PistonService,
  ) {}

  executeCode(sourceCode: string, stdin = "", language: CodeLanguage = "javascript"): Promise<CodeRunResult> {
    return this.getProvider() === "piston"
      ? this.piston.executeCode(sourceCode, stdin, language)
      : this.judge0.executeCode(sourceCode, stdin, language);
  }

  private getProvider(): ExecutionProvider {
    const configured = process.env.CODE_EXECUTION_PROVIDER?.trim().toLowerCase();
    if (configured === "judge0" || configured === "piston") return configured;
    if (configured) {
      throw new BadRequestException(
        "CODE_EXECUTION_PROVIDER must be either judge0 or piston.",
      );
    }

    return process.env.PISTON_URL?.trim() ? "piston" : "judge0";
  }
}
