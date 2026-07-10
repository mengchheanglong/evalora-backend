import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { CodeRunResult } from "./types/code.types";

interface Judge0Result {
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  time?: string | number | null;
  status?: {
    id: number;
    description: string;
  };
}

const JUDGE0_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_JAVASCRIPT_LANGUAGE_ID = 102;

@Injectable()
export class Judge0Service {
  async executeCode(sourceCode: string, stdin = ""): Promise<CodeRunResult> {
    const response = await this.requestJson<Judge0Result>(
      "/submissions?base64_encoded=true&wait=true",
      {
        method: "POST",
        body: JSON.stringify({
          source_code: encodeBase64(sourceCode),
          stdin: encodeBase64(stdin),
          language_id: this.getJavascriptLanguageId(),
          cpu_time_limit: 3,
          wall_time_limit: 5,
          memory_limit: 128_000,
          max_file_size: 1_024,
        }),
      },
    );

    return {
      stdout: decodeBase64(response.stdout),
      stderr: decodeBase64(response.stderr),
      compileOutput: decodeBase64(response.compile_output),
      status: mapJudge0Status(response),
      executionTime: readExecutionTime(response.time),
    };
  }

  private getJavascriptLanguageId(): number {
    const configured = Number(process.env.JUDGE0_JAVASCRIPT_LANGUAGE_ID);
    return Number.isInteger(configured) && configured > 0
      ? configured
      : DEFAULT_JAVASCRIPT_LANGUAGE_ID;
  }

  private getBaseUrl(): string {
    return (process.env.JUDGE0_API_URL?.trim() || "https://ce.judge0.com").replace(/\/$/, "");
  }

  private async requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const headers = new Headers(init.headers ?? undefined);
    headers.set("Accept", "application/json");
    headers.set("Content-Type", "application/json");

    const apiKey = process.env.JUDGE0_API_KEY?.trim();
    if (apiKey) {
      const keyHeader = process.env.JUDGE0_API_KEY_HEADER?.trim()
        || (baseUrl.includes("rapidapi.com") ? "X-RapidAPI-Key" : "X-Auth-Token");
      headers.set(keyHeader, apiKey);
      if (baseUrl.includes("rapidapi.com")) {
        headers.set("X-RapidAPI-Host", new URL(baseUrl).host);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), JUDGE0_REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } catch {
      throw new ServiceUnavailableException(
        "The Judge0 execution sandbox is unavailable. Check JUDGE0_API_URL and its network access.",
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Judge0 request failed with status ${response.status}. Check the configured sandbox credentials and capacity.`,
      );
    }

    return (await response.json()) as T;
  }
}

function encodeBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function decodeBase64(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return value;
  }
}

function readExecutionTime(value: string | number | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function mapJudge0Status(result: Judge0Result): CodeRunResult["status"] {
  const statusId = result.status?.id;
  if (statusId === 3) return "Accepted";
  if (statusId === 5) return "Time Limit Exceeded";
  if (statusId === 6 || result.compile_output) return "Compilation Error";
  if (typeof statusId === "number" && statusId >= 7 && statusId <= 12) return "Runtime Error";
  return "Execution Error";
}
