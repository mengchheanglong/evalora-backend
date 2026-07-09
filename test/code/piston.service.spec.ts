import { ServiceUnavailableException } from "@nestjs/common";
import { PistonService } from "../../src/modules/code/piston.service";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

const RUNTIMES = [
  { language: "javascript", version: "18.15.0", aliases: ["node-javascript", "js"], runtime: "node" },
  { language: "deno", version: "1.32.3", aliases: ["deno-js"], runtime: "deno" },
];

function executeBody(run: Record<string, unknown>, compile?: Record<string, unknown>) {
  return { language: "javascript", version: "18.15.0", run, ...(compile ? { compile } : {}) };
}

describe("PistonService", () => {
  const originalEnv = { ...process.env };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env = { ...originalEnv, PISTON_URL: "http://piston.test/api/v2" };
    delete process.env.PISTON_API_KEY;
    fetchMock = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it("maps a clean exit to Accepted and converts wall_time (ms) to seconds", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(RUNTIMES))
      .mockResolvedValueOnce(
        jsonResponse(executeBody({ stdout: "5\n", stderr: "", output: "5\n", code: 0, signal: null, wall_time: 42 })),
      );

    const service = new PistonService();
    const result = await service.executeCode("console.log(5)", "");

    expect(result).toEqual({
      stdout: "5\n",
      stderr: "",
      compileOutput: "",
      status: "Accepted",
      executionTime: 0.042,
    });
    // First call resolves the runtime, second executes.
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/runtimes$/);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/execute$/);
  });

  it("maps a non-zero exit code to Runtime Error and preserves stderr", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(RUNTIMES))
      .mockResolvedValueOnce(
        jsonResponse(
          executeBody({ stdout: "", stderr: "ReferenceError: x", output: "ReferenceError: x", code: 1, signal: null }),
        ),
      );

    const service = new PistonService();
    const result = await service.executeCode("console.log(x)", "");

    expect(result.status).toBe("Runtime Error");
    expect(result.stderr).toContain("ReferenceError");
  });

  it("maps a SIGKILL signal to Time Limit Exceeded", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(RUNTIMES))
      .mockResolvedValueOnce(
        jsonResponse(executeBody({ stdout: "", stderr: "", output: "", code: null, signal: "SIGKILL" })),
      );

    const service = new PistonService();
    const result = await service.executeCode("while(true){}", "");

    expect(result.status).toBe("Time Limit Exceeded");
  });

  it("maps a failed compile stage to Compilation Error and surfaces compile output", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(RUNTIMES))
      .mockResolvedValueOnce(
        jsonResponse(
          executeBody(
            { stdout: "", stderr: "", output: "", code: 0, signal: null },
            { stdout: "", stderr: "SyntaxError", output: "SyntaxError: bad", code: 1, signal: null },
          ),
        ),
      );

    const service = new PistonService();
    const result = await service.executeCode("function(", "");

    expect(result.status).toBe("Compilation Error");
    expect(result.compileOutput).toBe("SyntaxError: bad");
  });

  it("does not crash on a malformed response with no run stage", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(RUNTIMES))
      .mockResolvedValueOnce(jsonResponse({ language: "javascript", version: "18.15.0" }));

    const service = new PistonService();
    const result = await service.executeCode("console.log(1)", "");

    expect(result).toEqual({
      stdout: "",
      stderr: "",
      compileOutput: "",
      status: "Runtime Error",
      executionTime: 0,
    });
  });

  it("resolves and caches the runtime version across executions", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(RUNTIMES))
      .mockResolvedValueOnce(jsonResponse(executeBody({ stdout: "a\n", stderr: "", output: "a\n", code: 0, signal: null })))
      .mockResolvedValueOnce(jsonResponse(executeBody({ stdout: "b\n", stderr: "", output: "b\n", code: 0, signal: null })));

    const service = new PistonService();
    await service.executeCode("1", "");
    await service.executeCode("2", "");

    // /runtimes fetched once, /execute fetched twice → 3 total.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const runtimeCalls = fetchMock.mock.calls.filter((call) => /\/runtimes$/.test(String(call[0])));
    expect(runtimeCalls).toHaveLength(1);
  });

  it("surfaces a network failure as ServiceUnavailable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const service = new PistonService();

    await expect(service.executeCode("console.log(1)", "")).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("surfaces an upstream 401 as ServiceUnavailable with actionable guidance", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null, false, 401));

    const service = new PistonService();

    await expect(service.executeCode("console.log(1)", "")).rejects.toMatchObject({
      message: expect.stringContaining("401"),
    });
  });

  it("attaches the Authorization header when PISTON_API_KEY is set", async () => {
    process.env.PISTON_API_KEY = "secret-token";
    fetchMock
      .mockResolvedValueOnce(jsonResponse(RUNTIMES))
      .mockResolvedValueOnce(jsonResponse(executeBody({ stdout: "", stderr: "", output: "", code: 0, signal: null })));

    const service = new PistonService();
    await service.executeCode("console.log(1)", "");

    const runtimeHeaders = fetchMock.mock.calls[0][1].headers as Headers;
    expect(runtimeHeaders.get("Authorization")).toBe("secret-token");
  });
});
