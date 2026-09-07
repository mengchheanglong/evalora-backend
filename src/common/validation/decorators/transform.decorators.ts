import { Transform } from "class-transformer";

/**
 * Trims leading and trailing whitespace from a string property.
 */
export function Trim(): PropertyDecorator {
  return Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
}

/**
 * Coerces string query values to numbers safely.
 */
export function ToNumber(): PropertyDecorator {
  return Transform(({ value }) => {
    if (value === undefined || value === null || value === "") return undefined;
    const num = Number(value);
    return Number.isNaN(num) ? value : num;
  });
}

/**
 * Coerces string query/body values to booleans safely.
 * Recognizes "true", "1", true -> true; "false", "0", false -> false.
 */
export function ToBoolean(): PropertyDecorator {
  return Transform(({ value }) => {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    return value;
  });
}
