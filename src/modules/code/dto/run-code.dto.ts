import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { SUPPORTED_CODE_LANGUAGES } from "../constants/code.constants";

export class RunCodeDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(SUPPORTED_CODE_LANGUAGES)
  language!: string;

  @IsString()
  @IsNotEmpty()
  sourceCode!: string;

  @IsOptional()
  @IsString()
  stdin?: string;
}