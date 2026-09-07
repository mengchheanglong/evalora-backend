import { Body, Controller, Get, Inject, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { ValidateDto } from "../../common/pipes/validate-dto.pipe";
import { toAccessContext } from "../auth/access-control";
import { type AuthenticatedRequest, JwtAuthGuard, Roles, RolesGuard } from "../auth/auth.guard";
import { AdminService } from "./admin.service";
import {
  AdminOrganizationsQueryDto,
  AdminUsersQueryDto,
  UpdateOrganizationPlanDto,
  UpdateSuspensionDto,
  UpdateUserRoleDto,
} from "./dto/admin.dto";

/**
 * Super-admin platform dashboard. The role restriction sits on the class so a
 * future handler cannot be added without inheriting it; `JwtAuthGuard` also
 * re-reads the caller's role from the database, so a demoted or suspended admin
 * loses these routes on their next request.
 */
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Get("overview")
  overview(@Req() request: AuthenticatedRequest) {
    return this.adminService.overview(toAccessContext(request.user));
  }

  @Get("organizations")
  listOrganizations(
    @Req() request: AuthenticatedRequest,
    @Query(new ValidateDto(AdminOrganizationsQueryDto)) query: AdminOrganizationsQueryDto,
  ) {
    return this.adminService.listOrganizations(toAccessContext(request.user), query);
  }

  @Patch("organizations/:id/status")
  setOrganizationStatus(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ValidateDto(UpdateSuspensionDto)) body: UpdateSuspensionDto,
  ) {
    return this.adminService.setOrganizationStatus(toAccessContext(request.user), id, body.isSuspended);
  }

  @Patch("organizations/:id/plan")
  setOrganizationPlan(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ValidateDto(UpdateOrganizationPlanDto)) body: UpdateOrganizationPlanDto,
  ) {
    return this.adminService.setOrganizationPlan(toAccessContext(request.user), id, body.plan);
  }

  @Get("users")
  listUsers(@Req() request: AuthenticatedRequest, @Query(new ValidateDto(AdminUsersQueryDto)) query: AdminUsersQueryDto) {
    return this.adminService.listUsers(toAccessContext(request.user), query);
  }

  @Patch("users/:id/status")
  setUserStatus(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ValidateDto(UpdateSuspensionDto)) body: UpdateSuspensionDto,
  ) {
    return this.adminService.setUserStatus(toAccessContext(request.user), id, body.isSuspended);
  }

  @Patch("users/:id/role")
  setUserRole(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ValidateDto(UpdateUserRoleDto)) body: UpdateUserRoleDto,
  ) {
    return this.adminService.setUserRole(toAccessContext(request.user), id, body.role);
  }
}
