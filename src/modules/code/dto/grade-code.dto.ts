import { IsIn, IsNotEmpty, IsString } from "class-validator";
import { SUPPORTED_CODE_LANGUAGES } from "../constants/code.constants";

export class GradeCodeDto {
  @IsString()
  @IsNotEmpty()
  questionId!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(SUPPORTED_CODE_LANGUAGES)
  language!: string;

  @IsString()
  @IsNotEmpty()
  sourceCode!: string;
}
