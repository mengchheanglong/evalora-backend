import { BadRequestException, Injectable, type PipeTransform, type Type } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

/**
 * Validates request query parameters against an explicit DTO/schema class.
 *
 * Ensures transformation (such as string-to-number for pagination) and
 * whitelist/rule validation run consistently across dev and production.
 *
 * Usage: `@Query(new ValidateQuery(PaginationQueryDto)) query: PaginationQueryDto`
 */
@Injectable()
export class ValidateQuery<T extends object> implements PipeTransform {
  constructor(private readonly dtoClass: Type<T>) {}

  transform(value: unknown): T {
    const instance = plainToInstance(this.dtoClass, value ?? {}, {
      enableImplicitConversion: true,
      excludeExtraneousValues: false,
    });
    const errors = validateSync(instance as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));
      throw new BadRequestException(messages.length > 0 ? messages.join("; ") : "Invalid query parameters.");
    }
    return instance;
  }
}

export const ValidateQueryPipe = ValidateQuery;
