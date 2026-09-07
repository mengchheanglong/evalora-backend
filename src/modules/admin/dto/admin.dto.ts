import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export const ADMIN_PLANS = ["free", "pro", "enterprise"] as const;
export const ADMIN_STATUS_FILTERS = ["active", "suspended"] as const;
export const ADMIN_USER_ROLE_FILTERS = ["admin", "organization", "interviewer", "candidate"] as const;
/** Candidate is deliberately absent: an admin cannot turn a staff account into an invite-only record. */
export const ADMIN_ASSIGNABLE_ROLES = ["admin", "organization", "interviewer"] as const;

export const ADMIN_MAX_PAGE_SIZE = 100;
const SEARCH_MAX = 200;

// `@Type(() => Number)` is explicit rather than relying on implicit conversion:
// the tsx dev runtime emits no design:type metadata, so without it `page=2`
// would stay a string and fail @IsInt under `pnpm dev` while passing in the
// compiled build.
export class AdminListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX)
  q?: string;

  @IsOptional()
  @IsIn(ADMIN_STATUS_FILTERS)
  status?: (typeof ADMIN_STATUS_FILTERS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_MAX_PAGE_SIZE)
  pageSize?: number;
}

export class AdminOrganizationsQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(ADMIN_PLANS)
  plan?: (typeof ADMIN_PLANS)[number];
}

export class AdminUsersQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(ADMIN_USER_ROLE_FILTERS)
  role?: (typeof ADMIN_USER_ROLE_FILTERS)[number];
}

export class UpdateSuspensionDto {
  @IsBoolean()
  isSuspended!: boolean;
}

export class UpdateOrganizationPlanDto {
  @IsIn(ADMIN_PLANS)
  plan!: (typeof ADMIN_PLANS)[number];
}

export class UpdateUserRoleDto {
  @IsIn(ADMIN_ASSIGNABLE_ROLES)
  role!: (typeof ADMIN_ASSIGNABLE_ROLES)[number];
}
