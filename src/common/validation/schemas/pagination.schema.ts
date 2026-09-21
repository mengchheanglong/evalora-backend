import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { ToNumber, Trim } from "../decorators/transform.decorators";

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type SortOrder = "asc" | "desc";
export const SORT_ORDERS: readonly SortOrder[] = ["asc", "desc"] as const;

/**
 * Reusable schema for validating pagination query parameters.
 * Handles string-to-number transformation and bounded validation.
 */
export class PaginationQueryDto {
  @IsOptional()
  @ToNumber()
  @Type(() => Number)
  @IsInt({ message: "page must be an integer." })
  @Min(1, { message: "page must be greater than or equal to 1." })
  page?: number = DEFAULT_PAGE;

  @IsOptional()
  @ToNumber()
  @Type(() => Number)
  @IsInt({ message: "limit must be an integer." })
  @Min(1, { message: "limit must be greater than or equal to 1." })
  @Max(MAX_PAGE_SIZE, { message: `limit cannot exceed ${MAX_PAGE_SIZE}.` })
  limit?: number = DEFAULT_PAGE_SIZE;

  @IsOptional()
  @ToNumber()
  @Type(() => Number)
  @IsInt({ message: "offset must be an integer." })
  @Min(0, { message: "offset must be greater than or equal to 0." })
  offset?: number;

  /**
   * Calculates the Prisma/SQL skip offset.
   */
  getSkip(): number {
    if (this.offset !== undefined && this.offset !== null && !Number.isNaN(this.offset)) {
      return this.offset;
    }
    const pageNum = this.page && this.page >= 1 ? this.page : DEFAULT_PAGE;
    const limitNum = this.limit && this.limit >= 1 ? this.limit : DEFAULT_PAGE_SIZE;
    return (pageNum - 1) * limitNum;
  }

  /**
   * Calculates the Prisma/SQL take limit.
   */
  getTake(): number {
    const limitNum = this.limit && this.limit >= 1 ? this.limit : DEFAULT_PAGE_SIZE;
    return Math.min(limitNum, MAX_PAGE_SIZE);
  }

  /**
   * Returns a ready-to-use Prisma pagination object `{ skip, take }`.
   */
  toPrisma(): { skip: number; take: number } {
    return {
      skip: this.getSkip(),
      take: this.getTake(),
    };
  }
}

/**
 * Reusable schema for validating sorting query parameters.
 */
export class SortQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Trim()
  sortBy?: string;

  @IsOptional()
  @IsIn(SORT_ORDERS, { message: 'sortOrder must be either "asc" or "desc".' })
  @Trim()
  sortOrder?: SortOrder = "asc";
}

/**
 * Combined schema for pagination and sorting parameters.
 */
export class PaginationAndSortQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Trim()
  sortBy?: string;

  @IsOptional()
  @IsIn(SORT_ORDERS, { message: 'sortOrder must be either "asc" or "desc".' })
  @Trim()
  sortOrder?: SortOrder = "asc";
}
