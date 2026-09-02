import {
  IsArray,
  IsEmail,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import type { SessionStatus } from "../../../domain/evalora.types";
import { Trim } from "../../../common/validation/decorators/transform.decorators";

const ID_MAX_LENGTH = 128;
const NAME_MAX_LENGTH = 200;
const EMAIL_MAX_LENGTH = 320;
const VALID_STATUSES: readonly SessionStatus[] = ["not_started", "in_progress", "completed", "expired"] as const;

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty({ message: "templateId is required." })
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  templateId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  candidateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  @Trim()
  candidateName?: string;

  @IsOptional()
  @IsEmail({}, { message: "candidateEmail must be a valid email address." })
  @MaxLength(EMAIL_MAX_LENGTH)
  @Trim()
  candidateEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  organizationId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interviewerIds?: string[];

  @IsOptional()
  @IsString()
  @IsISO8601({ strict: false }, { message: "expiresAt must be a valid ISO-8601 date string." })
  @Trim()
  expiresAt?: string;
}

export class ListSessionsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  organizationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  candidateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  templateId?: string;

  @IsOptional()
  @IsIn(VALID_STATUSES, {
    message: `status must be one of: ${VALID_STATUSES.join(", ")}.`,
  })
  @Trim()
  status?: SessionStatus;
}
