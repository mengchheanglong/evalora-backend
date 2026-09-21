import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import type { ModuleType } from "../../../domain/evalora.types";
import { Trim } from "../../../common/validation/decorators/transform.decorators";

export const VALID_MODULE_TYPES: readonly ModuleType[] = [
  "ai_interview",
  "coding",
  "debugging",
  "work_style",
  "behavioral",
  "leadership",
  "communication",
  "problem_solving",
] as const;

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 2000;
const QUESTION_TEXT_MAX_LENGTH = 2000;
const RUBRIC_MAX_LENGTH = 500;
const ID_MAX_LENGTH = 128;

export class CloneFromCatalogDto {
  @IsString()
  @IsNotEmpty({ message: "catalogId is required." })
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  catalogId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  organizationId?: string;
}

export class CreateTemplateQuestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  id?: string;

  @IsString()
  @IsNotEmpty({ message: "questionText is required." })
  @MaxLength(QUESTION_TEXT_MAX_LENGTH)
  @Trim()
  questionText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(RUBRIC_MAX_LENGTH)
  @Trim()
  rubric?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  order?: number;

  @IsOptional()
  options?: unknown;

  @IsOptional()
  correctAnswer?: unknown;
}

export class CreateTemplateModuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  id?: string;

  @IsString()
  @IsNotEmpty({ message: "title is required." })
  @MaxLength(TITLE_MAX_LENGTH)
  @Trim()
  title!: string;

  @IsString()
  @IsNotEmpty({ message: "type is required." })
  @IsIn(VALID_MODULE_TYPES, {
    message: `type must be one of: ${VALID_MODULE_TYPES.join(", ")}.`,
  })
  @Trim()
  type!: ModuleType;

  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  @Trim()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  order?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  weight?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTemplateQuestionDto)
  questions?: CreateTemplateQuestionDto[];
}

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty({ message: "title is required." })
  @MaxLength(TITLE_MAX_LENGTH)
  @Trim()
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  @Trim()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Trim()
  roleLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  organizationId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  timeLimitMin?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTemplateModuleDto)
  modules?: CreateTemplateModuleDto[];
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(TITLE_MAX_LENGTH)
  @Trim()
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX_LENGTH)
  @Trim()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Trim()
  roleLevel?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  timeLimitMin?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTemplateModuleDto)
  modules?: CreateTemplateModuleDto[];
}

export class ListTemplatesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  organizationId?: string;
}
