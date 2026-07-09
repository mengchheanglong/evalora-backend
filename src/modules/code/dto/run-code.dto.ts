import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import {
  MAX_SOURCE_CODE_LENGTH,
  MAX_STDIN_LENGTH,
  SUPPORTED_CODE_LANGUAGES,
} from "../constants/code.constants";

export class RunCodeDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(SUPPORTED_CODE_LANGUAGES)
  language!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_SOURCE_CODE_LENGTH)
  sourceCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_STDIN_LENGTH)
  stdin?: string;
}
