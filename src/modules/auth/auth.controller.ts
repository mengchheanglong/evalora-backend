import { BadRequestException, Body, Controller, Get, Inject, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard";
import { type AuthenticatedRequest, tryExtractAuthUserFromHeader } from "./auth.guard";
import { AuthService, EmailVerificationRequiredError } from "./auth.service";
import {
  ForgotPasswordDto,
  GoogleAuthDto,
  LoginDto,
  RegisterDto,
  ResendEmailVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from "./dto/auth.dto";

// Rate limiting is applied per sensitive endpoint (not the whole controller) so
// the frequent, harmless GET /auth/me session probe is never throttled.
@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @UseGuards(AuthRateLimitGuard)
  @Post("register")
  async register(@Body() body: RegisterDto) {
    try {
      const result = await this.authService.register(body);
      return { ...result, message: "Registration successful." };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Registration failed.");
    }
  }

  @UseGuards(AuthRateLimitGuard)
  @Post("login")
  async login(@Body() body: LoginDto) {
    try {
      const result = await this.authService.login(body);
      return { ...result, message: "Login successful." };
    } catch (error) {
      if (error instanceof EmailVerificationRequiredError) {
        throw new UnauthorizedException(error.message);
      }
      throw new UnauthorizedException("Invalid email or password.");
    }
  }

  @UseGuards(AuthRateLimitGuard)
  @Post("verify-email")
  async verifyEmail(@Body() body: VerifyEmailDto) {
    try {
      const result = await this.authService.verifyEmail(body);
      return { ...result, message: "Email verified successfully." };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Email verification failed.");
    }
  }

  @UseGuards(AuthRateLimitGuard)
  @Post("resend-email-verification")
  async resendEmailVerification(@Body() body: ResendEmailVerificationDto) {
    try {
      return await this.authService.resendEmailVerification(body);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unable to resend verification email.");
    }
  }

  @UseGuards(AuthRateLimitGuard)
  @Post("google")
  async google(@Body() body: GoogleAuthDto) {
    try {
      const result = await this.authService.loginWithGoogle(body);
      return { ...result, message: "Google sign-in successful." };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google sign-in failed.";
      if (/not configured|credential is required|missing an email/i.test(message)) {
        throw new BadRequestException(message);
      }
      throw new UnauthorizedException(message);
    }
  }

  @UseGuards(AuthRateLimitGuard)
  @Post("forgot-password")
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    try {
      return await this.authService.requestPasswordReset(body);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unable to start password reset.");
    }
  }

  @UseGuards(AuthRateLimitGuard)
  @Post("reset-password")
  async resetPassword(@Body() body: ResetPasswordDto) {
    try {
      return await this.authService.resetPassword(body);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unable to reset password.");
    }
  }

  @Post("logout")
  logout() {
    return { message: "Client should clear token. Add server token invalidation if required." };
  }

  // Soft session probe: returns the current user for a valid token, otherwise
  // null with a 200 — so an anonymous check (login page, candidate flow, first
  // paint) does not surface a 401 in the browser console.
  @Get("me")
  async me(@Req() request: AuthenticatedRequest) {
    const authUser = tryExtractAuthUserFromHeader(request.headers.authorization);
    if (!authUser) return null;
    try {
      return await this.authService.getCurrentUser(authUser.id);
    } catch {
      return null;
    }
  }
}
