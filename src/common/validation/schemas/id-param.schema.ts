import { IsNotEmpty, IsString, IsUUID, MaxLength } from "class-validator";
import { Trim } from "../decorators/transform.decorators";

const ID_MAX_LENGTH = 128;

/**
 * Reusable schema for validating generic ID route parameters.
 * Validates non-empty trimmed strings up to 128 characters.
 */
export class IdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  id!: string;
}

/**
 * Reusable schema for validating UUID v4 route parameters.
 */
export class UuidParamDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID("4", { message: "Parameter must be a valid UUID v4." })
  @Trim()
  id!: string;
}

/**
 * Reusable schema for validating userId route/query parameters.
 */
export class UserIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  userId!: string;
}

/**
 * Reusable schema for validating sessionId route/query parameters.
 */
export class SessionIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  sessionId!: string;
}

/**
 * Reusable schema for validating templateId route/query parameters.
 */
export class TemplateIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  templateId!: string;
}

/**
 * Reusable schema for validating organizationId route/query parameters.
 */
export class OrganizationIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  organizationId!: string;
}

/**
 * Reusable schema for validating candidateId route/query parameters.
 */
export class CandidateIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(ID_MAX_LENGTH)
  @Trim()
  candidateId!: string;
}
