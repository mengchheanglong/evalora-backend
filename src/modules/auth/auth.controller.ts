import { BadRequestException, Body, Controller, Get, Inject, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { UserRole } from "../../domain/evalora.types";
import { type AuthenticatedRequest, JwtAuthGuard } from "./auth.guard";
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

  @Post("logout")
  logout() {
    return { message: "Client should clear token. Add server token invalidation if required." };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@Req() request: AuthenticatedRequest) {
    if (!request.user) throw new UnauthorizedException("Authentication required.");
    try {
      return await this.authService.getCurrentUser(request.user.id);
    } catch {
      throw new UnauthorizedException("Authentication required.");
    }
  }
}
