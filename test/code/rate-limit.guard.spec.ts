import { HttpException, type ExecutionContext } from "@nestjs/common";
import { CodeRateLimitGuard } from "../../src/modules/code/guards/rate-limit.guard";

function contextForIp(ip: string, headers: Record<string, string> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip, headers, socket: {} }),
    }),
  } as unknown as ExecutionContext;
}

describe("CodeRateLimitGuard", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = originalEnv;
  });

  it("allows requests up to the configured limit then throws 429", () => {
    process.env = { ...originalEnv, CODE_RATE_LIMIT_MAX: "3", CODE_RATE_LIMIT_WINDOW_MS: "60000" };
    const guard = new CodeRateLimitGuard();
    const ctx = contextForIp("10.0.0.1");

    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);

    let thrown: unknown;
    try {
      guard.canActivate(ctx);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getStatus()).toBe(429);
  });

  it("tracks limits independently per client", () => {
    process.env = { ...originalEnv, CODE_RATE_LIMIT_MAX: "1", CODE_RATE_LIMIT_WINDOW_MS: "60000" };
    const guard = new CodeRateLimitGuard();

    expect(guard.canActivate(contextForIp("1.1.1.1"))).toBe(true);
    expect(guard.canActivate(contextForIp("2.2.2.2"))).toBe(true);
    expect(() => guard.canActivate(contextForIp("1.1.1.1"))).toThrow(HttpException);
  });

  it("does not let a spoofed X-Forwarded-For header mint fresh buckets", () => {
    process.env = { ...originalEnv, CODE_RATE_LIMIT_MAX: "2", CODE_RATE_LIMIT_WINDOW_MS: "60000" };
    const guard = new CodeRateLimitGuard();

    // Same resolved client IP (Express's request.ip), but the attacker rotates
    // the forwarded header on each call hoping for a new bucket.
    expect(guard.canActivate(contextForIp("5.5.5.5", { "x-forwarded-for": "9.9.9.1" }))).toBe(true);
    expect(guard.canActivate(contextForIp("5.5.5.5", { "x-forwarded-for": "9.9.9.2" }))).toBe(true);
    expect(() =>
      guard.canActivate(contextForIp("5.5.5.5", { "x-forwarded-for": "9.9.9.3" })),
    ).toThrow(HttpException);
  });
});
