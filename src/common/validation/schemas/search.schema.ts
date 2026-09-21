import { IsOptional, IsString, MaxLength } from "class-validator";
import { Trim } from "../decorators/transform.decorators";

const SEARCH_MAX_LENGTH = 200;

/**
 * Reusable schema for search / keyword query parameters.
 */
export class SearchQueryDto {
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

  /**
   * Returns the normalized, non-empty search term or undefined.
   */
  getSearchTerm(): string | undefined {
    const term = this.search || this.q;
    return term && term.length > 0 ? term : undefined;
  }
}
