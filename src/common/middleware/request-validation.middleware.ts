import {
  BadRequestException,
  HttpStatus,
  Injectable,
  type NestMiddleware,
} from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";

/**
 * Middleware that intercepts incoming requests to inspect payload integrity,
 * headers, and query parameters before reaching controllers.
 */
@Injectable()
export class RequestValidationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // 1. Validate URL & Query string for null-byte / invalid URI encoding
    try {
      decodeURIComponent(req.path);
    } catch {
      throw new BadRequestException("Invalid request URI encoding.");
    }

    // 2. Validate Content-Type on write requests
    const method = req.method.toUpperCase();
    const isWriteMethod = ["POST", "PUT", "PATCH"].includes(method);
    const contentType = req.headers["content-type"] || "";
    const contentLength = Number(req.headers["content-length"] || "0");

    if (isWriteMethod && contentLength > 0) {
      if (contentType.includes("application/json")) {
        // If content-type is JSON and there is content, body must be an object, array, or boolean/number, not undefined/raw error
        if (req.body === undefined && req.readable) {
          // Stream was not parsed or failed parsing
          throw new BadRequestException("Malformed JSON payload: unable to parse request body.");
        }
      }
    }

    next();
  }
}

/**
 * Express error-handling middleware that intercepts body-parser SyntaxErrors (e.g. malformed JSON)
 * and payload limit errors, returning standardized 400/413 JSON responses.
 */
export function payloadSyntaxErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!err) {
    return next();
  }

  const errorObj = err as Record<string, unknown>;

  // Check for body-parser JSON SyntaxError
  if (
    (err instanceof SyntaxError &&
      ("body" in errorObj || errorObj.type === "entity.parse.failed" || errorObj.status === 400)) ||
    errorObj.type === "entity.parse.failed" ||
    (errorObj.status === 400 && errorObj.name === "SyntaxError")
  ) {
    res.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      error: "Bad Request",
      message: "Malformed JSON payload: The request body contains invalid JSON syntax.",
    });
    return;
  }

  // Check for payload too large
  if (errorObj.type === "entity.too.large" || errorObj.status === 413) {
    res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      error: "Payload Too Large",
      message: "The request payload exceeds the allowed size limit.",
    });
    return;
  }

  next(err);
}
