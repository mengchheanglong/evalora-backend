import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";

/**
 * Catches unhandled SyntaxErrors (such as malformed JSON payloads that reach Nest layer)
 * and formats them into a standardized 400 Bad Request error.
 */
@Catch(SyntaxError)
export class PayloadValidationFilter implements ExceptionFilter {
  private readonly logger = new Logger(PayloadValidationFilter.name);

  catch(exception: SyntaxError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    this.logger.warn(`Malformed payload intercepted: ${exception.message}`);

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      error: "Bad Request",
      message: "Malformed JSON payload: The request body contains invalid JSON syntax.",
    });
  }
}
