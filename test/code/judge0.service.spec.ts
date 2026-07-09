import { ServiceUnavailableException } from "@nestjs/common";
import { Judge0Service } from "../../src/modules/code/judge0.service";

function createResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("Judge0Service", () => {
  const originalEnv = { ...process.env };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      JUDGE0_URL: "https://judge0.example.com",
      JUDGE0_API_KEY: "test-key",
    };
    fetchMock = jest.fn();
    (global as never as { fetch: jest.Mock }).fetch = fetchMock;
    jest.spyOn(global, "setTimeout").mockImplementation(((callback: () => void) => {
      callback();
      return 0 as never;
    }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it("submits, polls, and normalizes a successful execution", async () => {
    fetchMock
      .mockResolvedValueOnce(createResponse({ token: "token-1" }))
      .mockResolvedValueOnce(createResponse({
        stdout: null,
        stderr: null,
        compile_output: null,
        time: "0.08",
        status: { id: 1, description: "In Queue" },
      }))
      .mockResolvedValueOnce(createResponse({
        stdout: "hello\n",
        stderr: "",
        compile_output: null,
        time: "0.08",
        status: { id: 3, description: "Accepted" },
      }));

    const service = new Judge0Service();
    const result = await service.executeCode({
      language: "javascript",
      sourceCode: "console.log('hello')",
      stdin: "",
    });

    expect(result).toEqual({
      stdout: "hello\n",
      stderr: "",
      compileOutput: "",
      status: "Accepted",
      executionTime: 0.08,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("surfaces network failures as service unavailable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const service = new Judge0Service();

    await expect(
      service.executeCode({
        language: "javascript",
        sourceCode: "console.log('hello')",
        stdin: "",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});