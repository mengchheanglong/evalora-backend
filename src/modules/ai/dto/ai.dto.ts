import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import type { ModuleType } from "../../../domain/evalora.types";

// Edge validation for the AI endpoints. Without these DTOs the global
// ValidationPipe is a no-op (interface bodies erase to `Object`), so an unknown
// `moduleType` reached `MODULE_EVALUATION_PROFILES[type].title` (TypeError → 500)
// and a non-array `evaluations` reached `.reduce` (TypeError → 500). These now
// fail closed with a 400.

const MODULE_TYPES: ModuleType[] = [
  "ai_interview",
  "coding",
  "debugging",
  "work_style",
  "behavioral",
  "leadership",
  "communication",
  "problem_solving",
];

const TEXT_MAX = 12_000;
const SHORT_MAX = 400;
const ITEM_MAX = 2_000;
const ARRAY_MAX = 50;

export class InterviewQuestionDto {
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) roleType?: string;
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) templateTitle?: string;
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) moduleTitle?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(ARRAY_MAX) @IsString({ each: true }) @MaxLength(ITEM_MAX, { each: true }) conversationHistory?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(ARRAY_MAX) @IsString({ each: true }) @MaxLength(ITEM_MAX, { each: true }) rubric?: string[];
}

export class FollowUpDto {
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) question?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) answer?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(ARRAY_MAX) @IsString({ each: true }) @MaxLength(ITEM_MAX, { each: true }) rubric?: string[];
}

export class EvaluateDto {
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) moduleId?: string;
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) moduleTitle?: string;
  @IsOptional() @IsIn(MODULE_TYPES) moduleType?: ModuleType;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) responseText?: string;
  // Kept separate from responseText so the question wording a caller supplies is
  // carried as context and never scored as if the candidate had said it.
  @IsOptional() @IsArray() @ArrayMaxSize(ARRAY_MAX) @IsString({ each: true }) @MaxLength(ITEM_MAX, { each: true }) questionContext?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(ARRAY_MAX) @IsString({ each: true }) @MaxLength(ITEM_MAX, { each: true }) rubric?: string[];
  @IsOptional() @IsNumber() @Min(0) @Max(100) weight?: number;
}

export class ReportDto {
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) sessionId?: string;
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) candidateName?: string;
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) assessmentName?: string;
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) completedAt?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(ARRAY_MAX) evaluations?: unknown[];
  @IsOptional() @IsArray() @ArrayMaxSize(ARRAY_MAX) @IsString({ each: true }) @MaxLength(ITEM_MAX, { each: true }) reviewerNotes?: string[];
}

export class CandidateInterviewQuestionDto {
  @IsOptional() @IsArray() @ArrayMaxSize(ARRAY_MAX) @IsString({ each: true }) @MaxLength(ITEM_MAX, { each: true }) conversationHistory?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(ARRAY_MAX) @IsString({ each: true }) @MaxLength(ITEM_MAX, { each: true }) rubric?: string[];
}

export class CandidateFollowUpDto {
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) questionId?: string;
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) moduleId?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) question?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) answer?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(ARRAY_MAX) @IsString({ each: true }) @MaxLength(ITEM_MAX, { each: true }) rubric?: string[];
}

export class AdaptiveQuestionsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) count?: number;
}

export class AdaptiveAnswerDto {
  @IsOptional() @IsString() @MaxLength(SHORT_MAX) questionId?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) question?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) answer?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) followUpQuestion?: string;
  @IsOptional() @IsString() @MaxLength(TEXT_MAX) followUpAnswer?: string;
}
