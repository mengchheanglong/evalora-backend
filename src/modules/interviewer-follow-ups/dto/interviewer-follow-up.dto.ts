import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ANSWER_TEXT_MAX, QUESTION_TEXT_MAX, QUESTION_TEXT_MIN } from "../interviewer-follow-ups.types";

const ID_MAX = 200;
const IDEMPOTENCY_KEY_MAX = 200;

export class SendInterviewerFollowUpDto {
  @IsOptional() @IsString() @MaxLength(ID_MAX) moduleId?: string;
  @IsOptional() @IsString() @MaxLength(ID_MAX) parentQuestionId?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(QUESTION_TEXT_MIN)
  @MaxLength(QUESTION_TEXT_MAX)
  questionText!: string;

  @IsOptional() @IsBoolean() required?: boolean;

  /** Stable client key so a retried send returns the original record. */
  @IsOptional() @IsString() @MaxLength(IDEMPOTENCY_KEY_MAX) idempotencyKey?: string;
}

export class AnswerInterviewerFollowUpDto {
  @IsOptional() @IsString() @MaxLength(ANSWER_TEXT_MAX) answerText?: string;

  /** Omitted/false autosaves a draft; true submits the final answer. */
  @IsOptional() @IsBoolean() submit?: boolean;
}
