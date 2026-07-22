import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

// Edge validation for the auth endpoints. The global ValidationPipe
// (whitelist + forbidNonWhitelisted) strips unknown fields and rejects extras —
// so, for example, `role` / `organizationId` can no longer be smuggled into
// public registration. The service re-validates (email format, password policy)
// as defense in depth and for non-HTTP callers/tests.

const EMAIL_MAX = 320;
const NAME_MAX = 200;
const PASSWORD_MAX = 128;
const TOKEN_MAX = 4000;
const CREDENTIAL_MAX = 8000;

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX)
  name!: string;

  @IsEmail()
  @MaxLength(EMAIL_MAX)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(NAME_MAX)
  organizationName?: string;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX)
  password!: string;

  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}

export class GoogleAuthDto {
  @IsOptional()
  @IsString()
  @MaxLength(CREDENTIAL_MAX)
  credential?: string;

  @IsOptional()
  @IsString()
  @MaxLength(CREDENTIAL_MAX)
  idToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(NAME_MAX)
  organizationName?: string;

  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}

export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(TOKEN_MAX)
  token!: string;
}

export class ResendEmailVerificationDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX)
  email!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(TOKEN_MAX)
  token!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX)
  password!: string;
}
