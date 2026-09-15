import { Body, Controller, Headers, HttpCode, Inject, Post } from "@nestjs/common";
import { SubscriptionsService } from "../subscriptions.service";
import { PAYWAY_SIGNATURE_HEADER } from "./payway.signature";

/**
 * PayWay payment pushback.
 *
 * Deliberately a separate, guard-free controller: PayWay cannot present a
 * session JWT, and running `JwtAuthGuard`/`RolesGuard` here would reject every
 * legitimate callback. The `X-PAYWAY-HMAC-SHA512` header is the credential,
 * verified against the merchant hash key before anything is read from the body.
 *
 * The endpoint is registered under `/api/subscriptions/payway/callback` so
 * payment callbacks stay inside the billing surface and can never be confused
 * with an authenticated subscription route.
 */
@Controller("subscriptions/payway")
export class PayWayCallbackController {
  constructor(@Inject(SubscriptionsService) private readonly subscriptions: SubscriptionsService) {}

  @Post("callback")
  @HttpCode(200)
  async callback(
    @Body() body: unknown,
    @Headers(PAYWAY_SIGNATURE_HEADER) signature: string | undefined,
  ) {
    return this.subscriptions.handlePayWayCallback(body, signature);
  }
}
