import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { CodeExecutionStatus } from "./types/code.types";

interface PistonRuntime {
  language: string;
  version: string;
  aliases: string[];
  runtime?: string;
}

interface PistonRunStage {
  stdout: string;
  stderr: string;
  output: string;
  code: number | null;
  signal: string | null;
  wall_time?: number;
  cpu_time?: number;
}

interface PistonExecutionResult {
  language: string;
  version: string;
  run: PistonRunStage;
  compile?: PistonRunStage;
}

const PISTON_REQUEST_TIMEOUT_MS = 15_000;

@Injectable()
export class PistonService {
  private cachedVersion: string | null = null;

  async executeCode(sourceCode: string, stdin = ""): Promise<{
    stdout: string;
    stderr: string;
    compileOutput: string;
    status: CodeExecutionStatus;
    executionTime: number;
  }> {
    const version = await this.getRuntimeVersion("javascript");
    const response = await this.requestJson<PistonExecutionResult>("/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        language: "javascript",
        version,
        files: [
          {
            name: "main.js",
            content: sourceCode,
          },
        ],
        stdin,
        args: [],
        compile_timeout: 10000,
        run_timeout: 3000,
        compile_memory_limit: -1,
        run_memory_limit: -1,
      }),
    });

    const status = this.mapStatus(response);

    return {
      stdout: response.run?.stdout ?? "",
      stderr: response.run?.stderr ?? "",
      compileOutput: response.compile?.output ?? "",
      status,
      executionTime: this.readExecutionTime(response.run),
    };
  }

  private async getRuntimeVersion(language: string): Promise<string> {
    if (this.cachedVersion) {
      return this.cachedVersion;
    }

    const runtimes = await this.requestJson<PistonRuntime[]>("/runtimes", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const candidates = runtimes.filter(
      (entry) =>
        entry.language === language ||
        entry.aliases.includes(language) ||
        entry.aliases.includes("js"),
    );

    // Prefer the Node runtime: the starter code uses require('fs'), which Deno does not support the same way.
    const runtime =
      candidates.find(
        (entry) => entry.runtime === "node" || entry.aliases.some((alias) => alias.startsWith("node")),
      ) ?? candidates[0];

    if (!runtime?.version) {
      throw new ServiceUnavailableException(`No Piston runtime found for ${language}.`);
    }

    this.cachedVersion = runtime.version;
    return runtime.version;
  }

  private readExecutionTime(run: PistonRunStage | undefined): number {
    const milliseconds = run?.wall_time ?? run?.cpu_time;
    return typeof milliseconds === "number" ? milliseconds / 1000 : 0;
  }

  private mapStatus(result: PistonExecutionResult): CodeExecutionStatus {
    if (result.compile && (result.compile.code !== 0 || result.compile.stderr || result.compile.output)) {
      return "Compilation Error";
    }

    if (result.run?.signal === "SIGKILL" || result.run?.signal === "SIGTERM") {
      return "Time Limit Exceeded";
    }

    if (result.run?.code === 0) {
      return "Accepted";
    }

    if (result.run?.stderr || result.run?.code !== 0) {
      return "Runtime Error";
    }

    return "Judge0 Unavailable";
  }

  private getBaseUrl(): string {
    return (process.env.PISTON_URL?.trim() || "https://emkc.org/api/v2/piston").replace(/\/$/, "");
  }

  private async requestJson<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;

    const headers = new Headers(init.headers ?? undefined);
    const apiKey = process.env.PISTON_API_KEY?.trim();
    if (apiKey) {
      headers.set("Authorization", apiKey);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PISTON_REQUEST_TIMEOUT_MS);

    try {
      response = await fetch(`${this.getBaseUrl()}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } catch {
      throw new ServiceUnavailableException(
        "Piston is unavailable. Check PISTON_URL and that your Piston instance is running.",
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new ServiceUnavailableException(
          "Piston rejected the request with 401. The public emkc.org Piston API is whitelist-only since 2026-02-15. " +
            "Self-host Piston and set PISTON_URL (e.g. http://localhost:2000/api/v2), or set PISTON_API_KEY for a private instance.",
        );
      }

      throw new ServiceUnavailableException(`Piston request failed with status ${response.status}.`);
    }

    return (await response.json()) as T;
  }
}
