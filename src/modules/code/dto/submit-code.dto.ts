import { IsIn, IsNotEmpty, IsString, MaxLength } from "class-validator";
import { MAX_SOURCE_CODE_LENGTH, SUPPORTED_CODE_LANGUAGES } from "../constants/code.constants";

export class SubmitCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  questionId!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(SUPPORTED_CODE_LANGUAGES)
  language!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_SOURCE_CODE_LENGTH)
  sourceCode!: string;
}
