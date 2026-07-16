import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Param,
  Post,
  Put,
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

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("organization", "interviewer", "admin")
  getWorkspace(@Req() request: AuthenticatedRequest) {
    return this.organizationService.getWorkspace(toAccessContext(request.user));
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("organization", "admin")
  async updateWorkspace(@Req() request: AuthenticatedRequest, @Body() body: { name?: string }) {
    try {
      return await this.organizationService.updateWorkspace(toAccessContext(request.user), body);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "Unable to update workspace.");
    }
  }

  @Get("privacy")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("organization", "interviewer", "admin")
  getPrivacy(@Req() request: AuthenticatedRequest) {
    return this.organizationService.getPrivacySummary(toAccessContext(request.user));
  }

  @Get("export")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("organization", "admin")
  async exportWorkspace(@Req() request: AuthenticatedRequest) {
    try {
      return await this.organizationService.exportWorkspaceData(toAccessContext(request.user));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "Unable to export workspace data.");
    }
  }

  @Delete("data")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("organization", "admin")
  @HttpCode(200)
  async deleteWorkspaceData(@Req() request: AuthenticatedRequest, @Body() body: { confirmName?: string }) {
    try {
      return await this.organizationService.deleteWorkspaceData(toAccessContext(request.user), body);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : "Unable to delete workspace data.");
    }
  }

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
