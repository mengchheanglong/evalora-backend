import { ServiceUnavailableException } from "@nestjs/common";
import { Judge0Service } from "../../src/modules/code/judge0.service";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

function encoded(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

describe("Judge0Service", () => {
  const originalEnv = { ...process.env };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      JUDGE0_API_URL: "http://judge0.test",
      JUDGE0_JAVASCRIPT_LANGUAGE_ID: "102",
    };
    delete process.env.JUDGE0_API_KEY;
    fetchMock = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it("executes JavaScript using base64-safe Judge0 requests", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      stdout: encoded("HELLO\n"),
      stderr: null,
      compile_output: null,
      time: "0.042",
      status: { id: 3, description: "Accepted" },
    }, true, 201));

    const result = await new Judge0Service().executeCode("console.log('HELLO')", "input");

    expect(result).toEqual({
      stdout: "HELLO\n",
      stderr: "",
      compileOutput: "",
      status: "Accepted",
      executionTime: 0.042,
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      source_code: encoded("console.log('HELLO')"),
      stdin: encoded("input"),
      language_id: 102,
    });
  });

  it.each([
    [5, "Time Limit Exceeded"],
    [6, "Compilation Error"],
    [7, "Runtime Error"],
    [13, "Execution Error"],
  ])("maps Judge0 status %s to %s", async (id, status) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      stdout: null,
      stderr: encoded("diagnostic"),
      compile_output: id === 6 ? encoded("syntax error") : null,
      time: null,
      status: { id, description: status },
    }, true, 201));

    const result = await new Judge0Service().executeCode("bad code");
    expect(result.status).toBe(status);
  });

  it("attaches the configured auth header", async () => {
    process.env.JUDGE0_API_KEY = "token";
    process.env.JUDGE0_API_KEY_HEADER = "X-Custom-Key";
    fetchMock.mockResolvedValueOnce(jsonResponse({
      status: { id: 3, description: "Accepted" },
    }, true, 201));

    await new Judge0Service().executeCode("console.log(1)");

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("X-Custom-Key")).toBe("token");
  });

  it("surfaces upstream failures as ServiceUnavailable", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null, false, 503));

    await expect(new Judge0Service().executeCode("console.log(1)"))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
