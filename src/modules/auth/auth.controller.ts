import { BadRequestException, Body, Controller, Get, Inject, Post, Req, UnauthorizedException } from "@nestjs/common";
import type { UserRole } from "../../domain/evalora.types";
import { type AuthenticatedRequest, tryExtractAuthUserFromHeader } from "./auth.guard";
import { AuthService } from "./auth.service";

interface RegisterRequest {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  organizationId?: string;
  organizationName?: string;
}

interface LoginRequest {
  email?: string;
  password?: string;
}

interface GoogleAuthRequest {
  credential?: string;
  idToken?: string;
  organizationName?: string;
}

interface ForgotPasswordRequest {
  email?: string;
}

interface ResetPasswordRequest {
  token?: string;
  password?: string;
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("register")
  async register(@Body() body: RegisterRequest) {
    try {
      const result = await this.authService.register(body);
      return { ...result, message: "Registration successful." };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Registration failed.");
    }
  }

  @Post("login")
  async login(@Body() body: LoginRequest) {
    try {
      const result = await this.authService.login(body);
      return { ...result, message: "Login successful." };
    } catch {
      throw new UnauthorizedException("Invalid email or password.");
    }
  }

  @Post("google")
  async google(@Body() body: GoogleAuthRequest) {
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

  @Post("forgot-password")
  async forgotPassword(@Body() body: ForgotPasswordRequest) {
    try {
      return await this.authService.requestPasswordReset(body);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Unable to start password reset.");
    }
  }

  @Post("reset-password")
  async resetPassword(@Body() body: ResetPasswordRequest) {
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
