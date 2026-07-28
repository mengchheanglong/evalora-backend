import { IsOptional, IsString, MaxLength, Validate, ValidatorConstraint, type ValidatorConstraintInterface } from "class-validator";

const MAX_RESPONSE_TEXT_LENGTH = 12_000;
const MAX_IDENTIFIER_LENGTH = 200;
const MAX_FOLLOW_UP_QUESTION_LENGTH = 4_000;

@ValidatorConstraint({ name: "candidateResponseJson", async: false })
class CandidateResponseJsonConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!isJsonValue(value)) return false;
    if (!isRecord(value)) return true;

    // Scoring context is always loaded by the server. Rejecting this key at the
    // edge also makes a failed database lookup unable to turn candidate input
    // into an authoritative rubric snapshot.
    if ("questionSnapshot" in value) return false;

    const followUp = value.aiFollowUp;
    if (followUp === undefined) return true;
    if (!isRecord(followUp)) return false;
    if (Object.keys(followUp).some((key) => key !== "question" && key !== "answer")) return false;

    const question = followUp.question;
    const answer = followUp.answer;
    return (question === undefined || (typeof question === "string" && question.length <= MAX_FOLLOW_UP_QUESTION_LENGTH))
      && (answer === undefined || (typeof answer === "string" && answer.length <= MAX_RESPONSE_TEXT_LENGTH));
  }

  defaultMessage(): string {
    return "Response JSON contains unsupported or private fields.";
  }
}

export class SaveResponseDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_IDENTIFIER_LENGTH)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_IDENTIFIER_LENGTH)
  questionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_RESPONSE_TEXT_LENGTH)
  responseText?: string;

  @IsOptional()
  @Validate(CandidateResponseJsonConstraint)
  responseJson?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}
