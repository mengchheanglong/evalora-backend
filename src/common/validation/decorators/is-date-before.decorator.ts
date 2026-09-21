import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from "class-validator";

@ValidatorConstraint({ name: "isDateBefore", async: false })
export class IsDateBeforeConstraint implements ValidatorConstraintInterface {
  validate(propertyValue: unknown, args: ValidationArguments): boolean {
    const [relatedPropertyName] = args.constraints;
    const relatedValue = (args.object as Record<string, unknown>)[relatedPropertyName];

    // If either value is not provided, pass validation (let @IsOptional/@IsNotEmpty handle presence)
    if (!propertyValue || !relatedValue) {
      return true;
    }

    const startDate = new Date(propertyValue as string | number | Date);
    const endDate = new Date(relatedValue as string | number | Date);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return true; // Let @IsISO8601 handle invalid date format
    }

    return startDate.getTime() <= endDate.getTime();
  }

  defaultMessage(args: ValidationArguments): string {
    const [relatedPropertyName] = args.constraints;
    return `${args.property} must be before or equal to ${relatedPropertyName}.`;
  }
}

/**
 * Validates that the annotated date property occurs before or at the same time
 * as the related date property on the same object.
 *
 * Usage:
 * ```ts
 * @IsOptional()
 * @IsISO8601()
 * @IsDateBefore('endDate')
 * startDate?: string;
 * ```
 */
export function IsDateBefore(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [property],
      validator: IsDateBeforeConstraint,
    });
  };
}
