import type { ArgumentsHost } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaExceptionFilter } from "../../src/common/filters/prisma-exception.filter";

function mockHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe("PrismaExceptionFilter", () => {
  it("maps a Prisma initialization failure to a 503 without leaking details", () => {
    const filter = new PrismaExceptionFilter();
    const { host, status, json } = mockHost();
    const exception = new Prisma.PrismaClientInitializationError(
      "Authentication failed against database server, credentials for `postgres` are not valid.",
      "6.19.3",
      "P1000",
    );

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      statusCode: 503,
      error: "Service Unavailable",
      message: "The service is temporarily unavailable. Please try again shortly.",
    });
    // No credential/connection detail in the client-facing payload.
    const payload = JSON.stringify(json.mock.calls[0][0]);
    expect(payload).not.toContain("postgres");
    expect(payload).not.toContain("Authentication failed");
  });
});
