import { IsISO8601, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { IsDateBefore } from "../decorators/is-date-before.decorator";
import { Trim } from "../decorators/transform.decorators";

/**
 * Reusable schema for validating single date parameters in ISO-8601 format.
 */
export class DateParamDto {
  @IsString()
  @IsNotEmpty({ message: "date is required." })
  @IsISO8601({ strict: false }, { message: "date must be a valid ISO-8601 date string." })
  @Trim()
  date!: string;
}

/**
 * Reusable schema for validating date range queries (startDate and endDate).
 * Enforces ISO-8601 format and that startDate <= endDate.
 */
export class DateRangeQueryDto {
  @IsOptional()
  @IsString()
  @IsISO8601({ strict: false }, { message: "startDate must be a valid ISO-8601 date string." })
  @IsDateBefore("endDate", { message: "startDate must be before or equal to endDate." })
  @Trim()
  startDate?: string;

  @IsOptional()
  @IsString()
  @IsISO8601({ strict: false }, { message: "endDate must be a valid ISO-8601 date string." })
  @Trim()
  endDate?: string;

  /**
   * Returns startDate parsed as a Date object or undefined.
   */
  getStartDate(): Date | undefined {
    return this.startDate ? new Date(this.startDate) : undefined;
  }

  /**
   * Returns endDate parsed as a Date object or undefined.
   */
  getEndDate(): Date | undefined {
    return this.endDate ? new Date(this.endDate) : undefined;
  }

  /**
   * Converts the parameters to a Prisma-compatible filter object `{ gte?, lte? }`.
   */
  toDateRange(): { gte?: Date; lte?: Date } | undefined {
    const gte = this.getStartDate();
    const lte = this.getEndDate();
    if (!gte && !lte) return undefined;
    return {
      ...(gte ? { gte } : {}),
      ...(lte ? { lte } : {}),
    };
  }
}

/**
 * Reusable schema for validating creation date range queries (from and to).
 * Enforces ISO-8601 format and that from <= to.
 */
export class CreatedAtRangeQueryDto {
  @IsOptional()
  @IsString()
  @IsISO8601({ strict: false }, { message: "from must be a valid ISO-8601 date string." })
  @IsDateBefore("to", { message: "from date must be before or equal to to date." })
  @Trim()
  from?: string;

  @IsOptional()
  @IsString()
  @IsISO8601({ strict: false }, { message: "to must be a valid ISO-8601 date string." })
  @Trim()
  to?: string;

  /**
   * Returns from parsed as a Date object or undefined.
   */
  getFromDate(): Date | undefined {
    return this.from ? new Date(this.from) : undefined;
  }

  /**
   * Returns to parsed as a Date object or undefined.
   */
  getToDate(): Date | undefined {
    return this.to ? new Date(this.to) : undefined;
  }

  /**
   * Converts the parameters to a Prisma-compatible filter object for createdAt.
   */
  toCreatedAtRange(): { gte?: Date; lte?: Date } | undefined {
    const gte = this.getFromDate();
    const lte = this.getToDate();
    if (!gte && !lte) return undefined;
    return {
      ...(gte ? { gte } : {}),
      ...(lte ? { lte } : {}),
    };
  }
}
