import { BadRequestException, Injectable, type PipeTransform, type Type } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { isUUID, validateSync } from "class-validator";

/**
 * Validates route parameters against an explicit DTO/schema class.
 *
 * Usage: `@Param(new ValidateParam(UuidParamDto)) params: UuidParamDto`
 */
@Injectable()
export class ValidateParam<T extends object> implements PipeTransform {
  constructor(private readonly dtoClass: Type<T>) {}

  transform(value: unknown): T {
    const instance = plainToInstance(this.dtoClass, value ?? {}, {
      enableImplicitConversion: true,
    });
    const errors = validateSync(instance as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));
      throw new BadRequestException(messages.length > 0 ? messages.join("; ") : "Invalid route parameters.");
    }
    return instance;
  }
}

export const ValidateParamPipe = ValidateParam;

/**
 * Lightweight pipe specifically for single UUID parameter validation.
 *
 * Usage: `@Param('id', new ParseUuidParamPipe()) id: string`
 */
@Injectable()
export class ParseUuidParamPipe implements PipeTransform<string, string> {
  constructor(private readonly version: "4" | "all" = "4") {}

  transform(value: string): string {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed || !isUUID(trimmed, this.version)) {
      throw new BadRequestException("Invalid ID format: expected a valid UUID.");
    }
    return trimmed;
  }
}
