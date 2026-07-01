import { Body, Controller, Get, Post } from "@nestjs/common";
import type { UserRole } from "../../domain/evalora.types";

interface RegisterRequest {
  name?: string;
  email?: string;
  role?: UserRole;
}

interface LoginRequest {
  email?: string;
}

@Controller("auth")
export class AuthController {
  @Post("register")
  register(@Body() body: RegisterRequest) {
    return {
      message: "Registration scaffold. Add password hashing, Prisma persistence, and JWT issuance.",
      user: {
        id: "user-demo",
        name: body.name ?? "Demo User",
        email: body.email ?? "demo@example.com",
        role: body.role ?? "candidate",
      },
    };
  }

  @Post("login")
  login(@Body() body: LoginRequest) {
    return {
      token: "demo-jwt-token",
      user: {
        id: "user-demo",
        email: body.email ?? "demo@example.com",
        role: "organization",
      },
      message: "Login scaffold. Replace with hashed password verification and signed JWT.",
    };
  }

  @Post("logout")
  logout() {
    return { message: "Client should clear token. Add server token invalidation if required." };
  }

  @Get("me")
  me() {
    return {
      id: "user-demo",
      name: "Demo Organization User",
      email: "demo@example.com",
      role: "organization",
    };
  }
}
