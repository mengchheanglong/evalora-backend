import { Body, Controller, Get, Inject, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { toAccessContext } from "../auth/access-control";
import { JwtAuthGuard, Roles, RolesGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { SubscriptionsService } from "./subscriptions.service";

@Controller("subscriptions")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("organization", "interviewer", "admin")
export class SubscriptionsController {
  constructor(@Inject(SubscriptionsService) private readonly subscriptions: SubscriptionsService) {}

  @Get("permissions")
  permissions(@Req() request: AuthenticatedRequest, @Res() response: Response) {
    const permissions = this.subscriptions.getBillingPermissions({ ...toAccessContext(request.user), email: request.user?.email });
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json(permissions);
  }

  @Get("current")
  async current(@Req() request: AuthenticatedRequest, @Res() response: Response) {
    const subscription = await this.subscriptions.getCurrent(toAccessContext(request.user));
    // Nest's default null return becomes an empty body; explicitly send JSON null.
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json(subscription);
  }

  /**
   * Starts a prepaid checkout for one billing cycle. The body carries only a
   * plan and a cycle — the backend catalog decides the amount PayWay is asked
   * for, so a tampered client cannot buy Business for the Plus price.
   */
  @Post("checkout")
  @Roles("organization", "interviewer")
  async checkout(@Req() request: AuthenticatedRequest, @Body() body: { plan?: unknown; billingCycle?: unknown }) {
    return this.subscriptions.checkout({ ...toAccessContext(request.user), email: request.user?.email }, body ?? {});
  }

  /** Payment status for the "Confirming payment…" screen; verifies with PayWay before reporting success. */
  @Get("attempts/:tranId")
  async attempt(@Req() request: AuthenticatedRequest, @Param("tranId") tranId: string) {
    return this.subscriptions.getAttempt(toAccessContext(request.user), tranId);
  }

  /** Cancel at period end. There is no automatic charge to stop. */
  @Post("cancel")
  @Roles("organization", "interviewer")
  async cancel(@Req() request: AuthenticatedRequest) {
    return this.subscriptions.cancel({ ...toAccessContext(request.user), email: request.user?.email });
  }
}
