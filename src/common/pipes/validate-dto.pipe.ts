import { BadRequestException, Injectable, type PipeTransform, type Type } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

/**
 * Validates a request body against an EXPLICIT DTO class.
 *
 * The global ValidationPipe reads the parameter type from `design:paramtypes`
 * reflection metadata — which the esbuild-based `tsx` dev runtime does not emit
 * (only the `tsc` production build does). That means the global pipe silently
 * validates nothing under `pnpm dev`. This pipe takes the DTO class directly, so
 * whitelisting + validation run identically in dev and in the compiled build.
 *
 * Usage: `@Body(new ValidateDto(CreateFooDto)) body: CreateFooDto`
 */
@Injectable()
export class ValidateDto<T extends object> implements PipeTransform {
  constructor(private readonly dtoClass: Type<T>) {}

  transform(value: unknown): T {
    const instance = plainToInstance(this.dtoClass, value ?? {}, { enableImplicitConversion: true });
    const errors = validateSync(instance as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));
      throw new BadRequestException(messages.length > 0 ? messages : "Invalid request body.");
    }
    return instance;
  }
}
