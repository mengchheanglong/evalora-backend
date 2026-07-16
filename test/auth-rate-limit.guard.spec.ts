import { HttpException, type ExecutionContext } from "@nestjs/common";
import { AuthRateLimitGuard } from "../src/modules/auth/auth-rate-limit.guard";

function contextForIp(ip: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ ip, socket: {} }) }),
  } as unknown as ExecutionContext;
}

describe("AuthRateLimitGuard", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = originalEnv;
  });

  it("allows attempts up to the limit then throws 429", () => {
    process.env = { ...originalEnv, AUTH_RATE_LIMIT_MAX: "3", AUTH_RATE_LIMIT_WINDOW_MS: "60000" };
    const guard = new AuthRateLimitGuard();
    const ctx = contextForIp("10.0.0.9");

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

  it("tracks the limit independently per client IP", () => {
    process.env = { ...originalEnv, AUTH_RATE_LIMIT_MAX: "1", AUTH_RATE_LIMIT_WINDOW_MS: "60000" };
    const guard = new AuthRateLimitGuard();

    expect(guard.canActivate(contextForIp("1.1.1.1"))).toBe(true);
    expect(guard.canActivate(contextForIp("2.2.2.2"))).toBe(true);
    expect(() => guard.canActivate(contextForIp("1.1.1.1"))).toThrow(HttpException);
  });
});
