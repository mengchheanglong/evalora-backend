import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";

/**
 * Maps a database that is unreachable/misconfigured (Prisma raises
 * PrismaClientInitializationError on connect — bad credentials, host down,
 * timeout) to a 503 Service Unavailable instead of a misleading 500.
 *
 * Deliberately narrow: only connection/initialization failures are treated as a
 * dependency outage. Query-logic errors keep falling through to the default
 * handler so genuine bugs are not masked as "try again later". The client-facing
 * message is generic so no connection string or credential detail leaks.
 */
@Catch(Prisma.PrismaClientInitializationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientInitializationError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    this.logger.error(
      `Database unavailable (${exception.errorCode ?? "unknown"}): ${exception.message}`,
    );

    response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      error: "Service Unavailable",
      message: "The service is temporarily unavailable. Please try again shortly.",
    });
  }
}
