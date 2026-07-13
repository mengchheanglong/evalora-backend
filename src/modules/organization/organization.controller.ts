import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.guard";
import { JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import { toAccessContext } from "../auth/access-control";
import { AuthService } from "../auth/auth.service";
import { OrganizationService } from "./organization.service";

@Controller("organization")
export class OrganizationController {
  constructor(
    @Inject(OrganizationService) private readonly organizationService: OrganizationService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Get("members")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("organization", "interviewer", "admin")
  listMembers(@Req() request: AuthenticatedRequest) {
    const access = toAccessContext(request.user);
    return this.organizationService.listMembers(access, request.user?.id);
  }

  @Get("invites")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("organization", "admin")
  listInvites(@Req() request: AuthenticatedRequest) {
    return this.organizationService.listInvites(toAccessContext(request.user));
  }

  @Post("invites")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("organization", "admin")
  createInvite(@Req() request: AuthenticatedRequest, @Body() body: { email?: string }) {
    return this.organizationService.createInvite(toAccessContext(request.user), body);
  }

  @Delete("invites/:inviteId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("organization", "admin")
  cancelInvite(@Req() request: AuthenticatedRequest, @Param("inviteId") inviteId: string) {
    return this.organizationService.cancelInvite(toAccessContext(request.user), inviteId);
  }

  @Delete("members/:memberId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("organization", "admin")
  removeMember(@Req() request: AuthenticatedRequest, @Param("memberId") memberId: string) {
    return this.organizationService.removeMember(toAccessContext(request.user), memberId);
  }

  @Get("invites/token/:token")
  getInvitePreview(@Param("token") token: string) {
    return this.organizationService.getInvitePreview(token);
  }

  @Post("invites/accept")
  @HttpCode(200)
  async acceptInvite(@Body() body: { token?: string; name?: string; password?: string }) {
    const accepted = await this.organizationService.acceptInvite(body);
    // Issue JWT the same way as login/register.
    const auth = await this.authService.login({
      email: accepted.user.email,
      password: body.password,
    });
    return {
      token: auth.token,
      user: auth.user,
      message: accepted.message,
    };
  }
}
