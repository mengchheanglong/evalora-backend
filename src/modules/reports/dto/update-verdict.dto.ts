import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { RecruiterVerdict } from "../../../domain/evalora.types";
import { RecruiterVerdict as PrismaRecruiterVerdict } from "@prisma/client";

export class UpdateRecruiterVerdictDto {
  @IsEnum(PrismaRecruiterVerdict)
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
