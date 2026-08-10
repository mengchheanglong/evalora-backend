import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_IDEA_LENGTH,
  MAX_MODULES,
  MAX_OPTION_LENGTH,
  MAX_OPTIONS,
  MAX_QUESTION_LENGTH,
  MAX_QUESTIONS_PER_MODULE,
  MAX_RATIONALE_LENGTH,
  MAX_RUBRIC_CRITERIA,
  MAX_RUBRIC_CRITERION_LENGTH,
  MAX_TIME_LIMIT_MIN,
  MAX_TITLE_LENGTH,
  MIN_TIME_LIMIT_MIN,
} from "../draft.constants";

/**
 * Request shapes for the draft endpoints.
 *
 * These caps reject absurd payloads at the edge; they are not the content rules.
 * Meaning — which module types exist, which weights are legal, what a question may
 * contain — is decided by `draft-normalizer.ts`, so the AI path and the hand-edit
 * path cannot drift apart.
 */

export class GenerateTemplateDraftDto {
  /** Free-text description of the role, when nothing is uploaded. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_IDEA_LENGTH)
  idea?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE_LENGTH)
  roleType?: string;
}

export class DraftWeightSignalsDto {
  @IsOptional()
  @IsNumber()
  roleImportance?: number;

  @IsOptional()
  @IsNumber()
  riskIfWeak?: number;

  @IsOptional()
  @IsNumber()
  evidenceVolume?: number;

  @IsOptional()
  @IsNumber()
  difficulty?: number;

  @IsOptional()
  @IsBoolean()
  essential?: boolean;
}

export class DraftQuestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  key?: string;

  @IsString()
  @MaxLength(MAX_QUESTION_LENGTH)
  questionText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  questionType?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_OPTIONS)
  @IsString({ each: true })
  @MaxLength(MAX_OPTION_LENGTH, { each: true })
  options?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_RUBRIC_CRITERIA)
  @IsString({ each: true })
  @MaxLength(MAX_RUBRIC_CRITERION_LENGTH, { each: true })
  rubric?: string[];
}

export class DraftModuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  key?: string;

  @IsString()
  @MaxLength(40)
  type!: string;

  @IsString()
  @MaxLength(MAX_TITLE_LENGTH)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string;

  /** Treated as relative intent, then rebalanced so the modules still total 100. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  weight?: number;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_RATIONALE_LENGTH)
  weightRationale?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DraftWeightSignalsDto)
  weightSignals?: DraftWeightSignalsDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_QUESTIONS_PER_MODULE)
  @ValidateNested({ each: true })
  @Type(() => DraftQuestionDto)
  questions?: DraftQuestionDto[];
}

export class UpdateTemplateDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE_LENGTH)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE_LENGTH)
  roleType?: string;

  @IsOptional()
  @IsInt()
  @Min(MIN_TIME_LIMIT_MIN)
  @Max(MAX_TIME_LIMIT_MIN)
  timeLimitMin?: number;

  @IsArray()
  @ArrayMaxSize(MAX_MODULES)
  @ValidateNested({ each: true })
  @Type(() => DraftModuleDto)
  modules!: DraftModuleDto[];
}

export class ConfirmTemplateDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE_LENGTH)
  title?: string;
}
