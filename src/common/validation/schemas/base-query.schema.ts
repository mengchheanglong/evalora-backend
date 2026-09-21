import { IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";
import { IsDateBefore } from "../decorators/is-date-before.decorator";
import { Trim } from "../decorators/transform.decorators";
import { PaginationAndSortQueryDto } from "./pagination.schema";

const SEARCH_MAX_LENGTH = 200;

/**
 * Composable base query schema providing pagination, sorting, search, and date range.
 */
export class BaseQueryDto extends PaginationAndSortQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH, { message: `search query cannot exceed ${SEARCH_MAX_LENGTH} characters.` })
  @Trim()
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH, { message: `q parameter cannot exceed ${SEARCH_MAX_LENGTH} characters.` })
  @Trim()
  q?: string;

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
   * Returns the normalized search term.
   */
  getSearchTerm(): string | undefined {
    const term = this.search || this.q;
    return term && term.length > 0 ? term : undefined;
  }

  /**
   * Returns parsed startDate.
   */
  getStartDate(): Date | undefined {
    return this.startDate ? new Date(this.startDate) : undefined;
  }

  /**
   * Returns parsed endDate.
   */
  getEndDate(): Date | undefined {
    return this.endDate ? new Date(this.endDate) : undefined;
  }

  /**
   * Converts the parameters to a Prisma-compatible date range.
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
