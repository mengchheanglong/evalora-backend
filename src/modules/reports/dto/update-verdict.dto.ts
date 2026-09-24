import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export enum RecruiterVerdict {
  STRONG_HIRE = "STRONG_HIRE",
  HIRE = "HIRE",
  NEUTRAL = "NEUTRAL",
  NO_HIRE = "NO_HIRE",
}

export class UpdateRecruiterVerdictDto {
  @IsEnum(RecruiterVerdict, { message: "verdict must be one of: STRONG_HIRE, HIRE, NEUTRAL, NO_HIRE" })
  @IsNotEmpty()
  verdict!: RecruiterVerdict;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  score?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
