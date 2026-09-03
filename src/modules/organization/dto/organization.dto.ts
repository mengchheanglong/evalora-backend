import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { Trim } from "../../../common/validation/decorators/transform.decorators";

const NAME_MAX_LENGTH = 200;
const EMAIL_MAX_LENGTH = 320;
const TOKEN_MAX_LENGTH = 4000;
const PASSWORD_MAX_LENGTH = 128;

export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "Workspace name cannot be empty." })
  @MaxLength(NAME_MAX_LENGTH)
  @Trim()
  name?: string;
}

export class DeleteWorkspaceDataDto {
  @IsOptional()
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  @Trim()
  confirmName?: string;
}

export class CreateInviteDto {
  @IsEmail({}, { message: "email must be a valid email address." })
  @MaxLength(EMAIL_MAX_LENGTH)
  @Trim()
  email!: string;
}

export class AcceptInviteDto {
  @IsString()
  @IsNotEmpty({ message: "Invite token is required." })
  @MaxLength(TOKEN_MAX_LENGTH)
  @Trim()
  token!: string;

  @IsOptional()
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  @Trim()
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password?: string;
}
