import { GatewayTimeoutException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  DEFAULT_JUDGE0_LANGUAGE_IDS,
  JUDGE0_POLL_INTERVAL_MS,
  JUDGE0_TIMEOUT_MS,
} from "./constants/code.constants";
import type { CodeExecutionStatus } from "./types/code.types";
import type {
  Judge0ExecutionRequest,
  Judge0ExecutionResult,
  Judge0ResultPayload,
  Judge0SubmissionResult,
} from "./interfaces/judge0.interfaces";

@Injectable()
export class Judge0Service {
  async executeCode(request: Judge0ExecutionRequest): Promise<Judge0ExecutionResult> {
    const token = await this.submitExecution(request);
    const result = await this.waitForExecution(token);

    return this.normalizeResult(result);
  }

  private async submitExecution(request: Judge0ExecutionRequest): Promise<string> {
    const baseUrl = this.getBaseUrl();
    const response = await this.requestJson<Judge0SubmissionResult>(`${baseUrl}/submissions`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        language_id: this.getJudge0LanguageId(request.language),
        source_code: request.sourceCode,
        stdin: request.stdin ?? "",
        expected_output: request.expectedOutput,
        base64_encoded: false,
        wait: false,
      }),
    });

    if (!response.token) {
      throw new ServiceUnavailableException("Judge0 did not return a submission token.");
    }

    return response.token;
  }

  private async waitForExecution(token: string): Promise<Judge0ResultPayload> {
    const startedAt = Date.now();
    const baseUrl = this.getBaseUrl();

    while (Date.now() - startedAt <= JUDGE0_TIMEOUT_MS) {
      const result = await this.requestJson<Judge0ResultPayload>(
        `${baseUrl}/submissions/${encodeURIComponent(token)}?base64_encoded=false`,
        {
          method: "GET",
          headers: this.getHeaders(),
        },
      );

      if (result.status.id > 2) {
        return result;
      }

      await this.sleep(JUDGE0_POLL_INTERVAL_MS);
    }

    throw new GatewayTimeoutException("Code execution timed out while waiting for Judge0.");
  }

  private normalizeResult(result: Judge0ResultPayload): Judge0ExecutionResult {
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      compileOutput: result.compile_output ?? "",
      status: this.mapStatus(result.status.id, result.status.description, result.compile_output),
      executionTime: Number(result.time ?? 0),
    };
  }

  private mapStatus(statusId: number, description: string, compileOutput: string | null): CodeExecutionStatus {
    if (statusId === 3) {
      return "Accepted";
    }

    if (statusId === 5) {
      return "Time Limit Exceeded";
    }

    if (statusId === 6 || compileOutput) {
      return "Compilation Error";
    }

    if (statusId === 4) {
      return "Wrong Answer";
    }

    if (statusId >= 7) {
      return "Runtime Error";
    }

    return description === "Wrong Answer" ? "Wrong Answer" : "Judge0 Unavailable";
  }

  private getJudge0LanguageId(language: keyof typeof DEFAULT_JUDGE0_LANGUAGE_IDS): number {
    const envKey = `JUDGE0_LANGUAGE_ID_${language.toUpperCase()}`;
    const configuredValue = Number(process.env[envKey]);

    if (Number.isInteger(configuredValue) && configuredValue > 0) {
      return configuredValue;
    }

    return DEFAULT_JUDGE0_LANGUAGE_IDS[language];
  }

  private getBaseUrl(): string {
    const baseUrl = process.env.JUDGE0_URL?.trim();

    if (!baseUrl) {
      throw new ServiceUnavailableException("JUDGE0_URL is not configured.");
    }

    return baseUrl.replace(/\/$/, "");
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const apiKey = process.env.JUDGE0_API_KEY?.trim();
    const authHeaderName = process.env.JUDGE0_AUTH_HEADER?.trim();

    if (apiKey && authHeaderName) {
      headers[authHeaderName] = apiKey;
    } else if (apiKey) {
      headers["X-Auth-Token"] = apiKey;
    }

    return headers;
  }

  private async requestJson<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response;

    try {
      response = await fetch(url, init);
    } catch {
      throw new ServiceUnavailableException("Judge0 is unavailable.");
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(`Judge0 request failed with status ${response.status}.`);
    }

    return (await response.json()) as T;
  }

  private async sleep(milliseconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}