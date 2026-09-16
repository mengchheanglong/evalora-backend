import "reflect-metadata";
import { Module, ServiceUnavailableException, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import * as jwt from "jsonwebtoken";
import { SubscriptionsController } from "../src/modules/subscriptions/subscriptions.controller";
import { SubscriptionsService } from "../src/modules/subscriptions/subscriptions.service";
import { PayWayCallbackController } from "../src/modules/subscriptions/payway/payway-callback.controller";
import {
  PAYWAY_SIGNATURE_HEADER,
  callbackSignature,
  hmacSha512Base64,
  purchaseHash,
} from "../src/modules/subscriptions/payway/payway.signature";
import { interpretPaymentOutcome } from "../src/modules/subscriptions/payway/payway.verification";
import {
  addBillingCycle,
  formatAmount,
  planPrice,
  type BillingCycleName,
  type SubscriptionPlanName,
} from "../src/modules/subscriptions/plan-catalog";
import { JwtAuthGuard, RolesGuard } from "../src/modules/auth/auth.guard";
import type { AccessContext } from "../src/modules/auth/access-control";
import type { PayWayGateway } from "../src/modules/subscriptions/payway";
import {
  BillingFake,
  TEST_PAYWAY_CONFIG,
  approvedPayment,
  createPayWayHarness,
  declinedPayment,
  pendingPayment,
} from "./common/billing-fake";

const NOW = "2026-09-13T09:00:00.000Z";
const MONTH_END = "2026-10-01T00:00:00.000Z";

const fake = new BillingFake();
const harness = createPayWayHarness();
// One service instance for the whole file: the store and harness are reset per test
// so the injected clock and the fake Prisma stay the same objects.
const service = new SubscriptionsService(fake.asPrismaService(), harness.gateway, () => fake.now);
let app: INestApplication;
let baseUrl: string;
const previousSecret = process.env.JWT_SECRET;

@Module({
  controllers: [SubscriptionsController, PayWayCallbackController],
  providers: [JwtAuthGuard, RolesGuard, { provide: SubscriptionsService, useValue: service }],
})
class TestModule {}

beforeAll(async () => {
  process.env.JWT_SECRET = "billing-tests-only-secret";
  app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix("api");
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

beforeEach(() => {
  fake.reset();
  harness.reset();
  fake.setNow(NOW);
});

function token(role: string, organizationId: string | null = "org-a", email = "owner@example.invalid") {
  return jwt.sign(
    { sub: "user-1", email, role, ...(organizationId ? { organizationId } : {}), purpose: "session" },
    process.env.JWT_SECRET!,
  );
}

function post(path: string, body: unknown, authToken: string | null = token("organization")) {
  return fetch(`${baseUrl}/api${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function get(path: string, authToken: string | null = token("organization")) {
  return fetch(`${baseUrl}/api${path}`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  });
}

async function checkout(plan: string, billingCycle: string, authToken: string | null = token("organization")) {
  const response = await post("/subscriptions/checkout", { plan, billingCycle }, authToken);
  return { response, body: (await response.json()) as Record<string, unknown> };
}

/** PayWay pushback with a genuine HMAC header, as produced by the documented algorithm. */
function callback(payload: Record<string, unknown>, signature = callbackSignature(payload, TEST_PAYWAY_CONFIG.apiKey) ?? "") {
  return fetch(`${baseUrl}/api/subscriptions/payway/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [PAYWAY_SIGNATURE_HEADER]: signature },
    body: JSON.stringify(payload),
  });
}

describe("catalog and documented signing", () => {
  it.each([
    ["PLUS", "MONTHLY", 2_900, "29.00"],
    ["PLUS", "ANNUAL", 27_600, "276.00"],
    ["PRO", "MONTHLY", 7_900, "79.00"],
    ["PRO", "ANNUAL", 75_600, "756.00"],
    ["BUSINESS", "MONTHLY", 19_900, "199.00"],
    ["BUSINESS", "ANNUAL", 190_800, "1908.00"],
  ] as Array<[SubscriptionPlanName, BillingCycleName, number, string]>)("prices %s %s at %i", (plan, cycle, expected, display) => {
    expect(planPrice(plan, cycle)).toBe(expected);
    expect(formatAmount(expected)).toBe(display);
  });

  it("adds calendar cycles in UTC, clamping days that do not exist", () => {
    expect(addBillingCycle(new Date("2026-09-13T09:00:00.000Z"), "MONTHLY").toISOString()).toBe("2026-10-13T09:00:00.000Z");
    expect(addBillingCycle(new Date("2026-01-31T00:00:00.000Z"), "MONTHLY").toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(addBillingCycle(new Date("2024-02-29T00:00:00.000Z"), "ANNUAL").toISOString()).toBe("2025-02-28T00:00:00.000Z");
    expect(addBillingCycle(new Date("2026-12-31T00:00:00.000Z"), "ANNUAL").toISOString()).toBe("2027-12-31T00:00:00.000Z");
  });

  it("rejects a non-positive amount rather than signing a zero-price checkout", () => {
    expect(() => formatAmount(0)).toThrow();
  });

  it("hashes the Purchase request over the documented field order", () => {
    const fields = { req_time: "20260913000000", merchant_id: "ec000002", tran_id: "EVLTESTTRAN0001", amount: "79.00",
      items: "W3sibmFtZSI6IlBSTyBwbGFuIl1d", currency: "USD",
      return_url: "aHR0cHM6Ly9hcGkuZXZhbG9yYS5pbnZhbGlkL2FwaS9zdWJzY3JpcHRpb25zL3BheXdheS9jYWxsYmFjaw==",
      continue_success_url: "https://app.evalora.invalid/settings/billing?checkout=return&tran_id=EVLTESTTRAN0001",
      cancel_url: "https://app.evalora.invalid/settings/billing?checkout=cancelled&tran_id=EVLTESTTRAN0001",
      return_params: "EVLTESTTRAN0001" };
    // Positions 6-12, 16, 18 and 20-24 are unset and contribute an empty string.
    const documentedOrder = [fields.req_time, fields.merchant_id, fields.tran_id, fields.amount, fields.items,
      "", "", "", "", "", "", "", fields.return_url, fields.cancel_url, fields.continue_success_url,
      "", fields.currency, "", fields.return_params, "", "", "", "", ""].join("");
    expect(purchaseHash(fields, TEST_PAYWAY_CONFIG.apiKey)).toBe(hmacSha512Base64(documentedOrder, TEST_PAYWAY_CONFIG.apiKey));
    expect(purchaseHash(fields, TEST_PAYWAY_CONFIG.apiKey)).toBe(
      "IayfT92wes7vxzUbqNpjphN3azLQw9IE7BqPwnnTCeN0Ypauyeuomhr/L0uH5ierXpv7Q5Ba8Mxj3EWuEm7wwA==",
    );
  });

  it("signs the callback over key-sorted values", () => {
    const payload = { tran_id: "9e55c7c4b4d9488a96db", apv: "832865", status: "0",
      return_params: "{\"order_id\":\"123\",\"amount\":100,\"client_id\":\"1234567890\"}", merchant_ref: "" };
    const sorted = payload.apv + payload.merchant_ref + payload.return_params + payload.status + payload.tran_id;
    expect(callbackSignature(payload, TEST_PAYWAY_CONFIG.apiKey)).toBe(hmacSha512Base64(sorted, TEST_PAYWAY_CONFIG.apiKey));
    expect(callbackSignature(payload, TEST_PAYWAY_CONFIG.apiKey)).toBe(
      "L1n+ZmjtXBFbryux+br+anvB/fR2uuiLqfebyOr9BiebNtQPFxNP+yop9gpjVlH3O6QOfTWGhRn5fP2HYo3fcQ==",
    );
  });

  it("maps only the documented status codes to a decision", () => {
    expect(interpretPaymentOutcome({ providerStatusCode: 0, providerStatus: "APPROVED", amountMinor: 1, amountSource: "total_amount", currency: "USD", reference: "1", gatewayCode: "00", gatewayMessage: null })).toBe("APPROVED");
    expect(interpretPaymentOutcome({ providerStatusCode: 2, providerStatus: "PENDING", amountMinor: 1, amountSource: null, currency: "USD", reference: null, gatewayCode: "00", gatewayMessage: null })).toBe("PENDING");
    expect(interpretPaymentOutcome({ providerStatusCode: 3, providerStatus: "DECLINED", amountMinor: 1, amountSource: null, currency: "USD", reference: null, gatewayCode: "00", gatewayMessage: null })).toBe("DECLINED");
    expect(interpretPaymentOutcome({ providerStatusCode: 7, providerStatus: "CANCELLED", amountMinor: 1, amountSource: null, currency: "USD", reference: null, gatewayCode: "00", gatewayMessage: null })).toBe("CANCELLED");
    expect(interpretPaymentOutcome({ providerStatusCode: 99, providerStatus: null, amountMinor: null, amountSource: null, currency: null, reference: null, gatewayCode: "00", gatewayMessage: null })).toBe("UNKNOWN");
  });
});

describe("POST /subscriptions/checkout", () => {
  it.each([
    ["PLUS", "MONTHLY", 2_900],
    ["PLUS", "ANNUAL", 27_600],
    ["PRO", "MONTHLY", 7_900],
    ["PRO", "ANNUAL", 75_600],
    ["BUSINESS", "MONTHLY", 19_900],
    ["BUSINESS", "ANNUAL", 190_800],
  ])("starts a %s %s checkout at the catalog price", async (plan, billingCycle, amountMinor) => {
    const { response, body } = await checkout(plan, billingCycle);
    expect(response.status).toBe(201);
    expect(body).toMatchObject({ plan, billingCycle, amountMinor, currency: "USD", purpose: "NEW_SUBSCRIPTION" });
    expect(body.amountDisplay).toBe(formatAmount(amountMinor));

    const session = body.checkout as { actionUrl: string; method: string; fields: Record<string, string> };
    expect(session.method).toBe("POST");
    expect(session.actionUrl).toBe("https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase");
    expect(session.fields.tran_id).toBe(body.tranId);
    expect(session.fields.amount).toBe(formatAmount(amountMinor));
    expect(session.fields.currency).toBe("USD");
    expect(session.fields.view_type).toBe("hosted_view");
    expect(session.fields.payment_gate).toBe("0");
    expect(session.fields.merchant_id).toBe(TEST_PAYWAY_CONFIG.merchantId);
    // The callback URL travels base64-encoded as ABA documents, and the hash covers it.
    expect(session.fields.return_url).toBe(Buffer.from(TEST_PAYWAY_CONFIG.paymentCallbackUrl, "utf8").toString("base64"));
    expect(session.fields.continue_success_url).toContain(`/settings/billing?checkout=return&tran_id=${body.tranId}`);
    expect(session.fields.cancel_url).toContain("checkout=cancelled");
    const documentedOrder = [session.fields.req_time, session.fields.merchant_id, session.fields.tran_id,
      session.fields.amount, session.fields.items, "", "", "", "", "", "", "", session.fields.return_url,
      session.fields.cancel_url, session.fields.continue_success_url, "", session.fields.currency, "",
      session.fields.return_params, "", "", "", "", ""].join("");
    expect(session.fields.hash).toBe(hmacSha512Base64(documentedOrder, TEST_PAYWAY_CONFIG.apiKey));
    // The merchant hash key never leaves the backend.
    expect(JSON.stringify(body)).not.toContain(TEST_PAYWAY_CONFIG.apiKey);

    const attempt = fake.attempt(String(body.tranId));
    expect(attempt).toMatchObject({ organizationId: "org-a", status: "PENDING", purpose: "NEW_SUBSCRIPTION", amountMinor });
  });

  it.each<[unknown, string]>([
    [{ plan: "ENTERPRISE", billingCycle: "MONTHLY" }, "Plan must be PLUS, PRO, or BUSINESS."],
    [{ plan: "plus", billingCycle: "MONTHLY" }, "Plan must be PLUS, PRO, or BUSINESS."],
    [{ plan: "PRO", billingCycle: "WEEKLY" }, "Billing cycle must be MONTHLY or ANNUAL."],
    [{}, "Plan must be PLUS, PRO, or BUSINESS."],
    [undefined, "Plan must be PLUS, PRO, or BUSINESS."],
  ])("rejects an invalid selection %#", async (body, message) => {
    const response = await post("/subscriptions/checkout", body);
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe(message);
    expect(fake.attempts).toHaveLength(0);
  });

  it("never reads an amount from the request body", async () => {
    const response = await post("/subscriptions/checkout", { plan: "PLUS", billingCycle: "MONTHLY", amountMinor: 1, amount: 1 });
    expect(response.status).toBe(201);
    expect(((await response.json()) as { amountMinor: number }).amountMinor).toBe(2_900);
    expect(fake.attempts[0].amountMinor).toBe(2_900);
  });

  it("requires authentication", async () => {
    const response = await post("/subscriptions/checkout", { plan: "PRO", billingCycle: "MONTHLY" }, null);
    expect(response.status).toBe(401);
    expect(fake.attempts).toHaveLength(0);
  });

  it.each(["interviewer", "admin", "candidate"])("rejects a %s who is not the workspace owner", async (role) => {
    const response = await post("/subscriptions/checkout", { plan: "PRO", billingCycle: "MONTHLY" }, token(role));
    expect(response.status).toBe(403);
    expect(fake.attempts).toHaveLength(0);
  });

  it("reuses the in-flight attempt for a repeated click instead of opening a second transaction", async () => {
    const first = await checkout("PRO", "MONTHLY");
    const second = await checkout("PRO", "MONTHLY");
    expect(second.body.tranId).toBe(first.body.tranId);
    expect(fake.attempts).toHaveLength(1);
  });

  it("collapses two identical concurrent checkouts onto one attempt", async () => {
    const [first, second] = await Promise.all([checkout("PRO", "MONTHLY"), checkout("PRO", "MONTHLY")]);
    expect(first.body.tranId).toBe(second.body.tranId);
    expect(fake.attempts).toHaveLength(1);
  });

  it("marks a mid-period change of plan or cycle as a pending plan change", async () => {
    fake.seedSubscription({ organizationId: "org-a", plan: "PRO", billingCycle: "MONTHLY", currentPeriodEnd: new Date(MONTH_END) });
    const { body } = await checkout("BUSINESS", "ANNUAL");
    expect(body).toMatchObject({ purpose: "PLAN_CHANGE", plan: "BUSINESS", billingCycle: "ANNUAL", amountMinor: 190_800 });
  });

  it("refuses a second plan change while one is already scheduled", async () => {
    fake.seedSubscription({ organizationId: "org-a", pendingPlan: "BUSINESS", pendingBillingCycle: "MONTHLY" });
    const same = await post("/subscriptions/checkout", { plan: "BUSINESS", billingCycle: "MONTHLY" });
    expect(same.status).toBe(409);
    expect((await same.json()).message).toBe("That plan is already scheduled for the end of the current period.");

    const other = await post("/subscriptions/checkout", { plan: "PLUS", billingCycle: "MONTHLY" });
    expect(other.status).toBe(409);
    expect((await other.json()).message).toBe("A plan change is already scheduled for the end of the current period.");
    expect(fake.attempts).toHaveLength(0);
  });

  it("reports 503 instead of throwing when PayWay is not configured", async () => {
    const unconfiguredGateway: PayWayGateway = {
      isConfigured: () => false,
      createCheckoutSession: () => { throw new Error("must not be called"); },
      checkTransaction: async () => ({ kind: "unavailable", reason: "not configured" }),
      verifyCallbackSignature: () => false,
    };
    const unconfigured = new SubscriptionsService(fake.asPrismaService(), unconfiguredGateway, () => fake.now);
    const access: AccessContext = { userId: "user-1", role: "organization", organizationId: "org-a" };

    await expect(unconfigured.checkout(access, { plan: "PRO", billingCycle: "MONTHLY" }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fake.attempts).toHaveLength(0);
  });
});

describe("POST /subscriptions/payway/callback", () => {
  async function startCheckout(plan = "PRO", billingCycle = "MONTHLY") {
    const { body } = await checkout(plan, billingCycle);
    return String(body.tranId);
  }

  it("activates a monthly subscription only after PayWay confirms the payment", async () => {
    const tranId = await startCheckout("PRO", "MONTHLY");
    harness.respond(tranId, approvedPayment(tranId, { amount: 79 }));

    const response = await callback({ tran_id: tranId, apv: "832865", status: "0", return_params: tranId, merchant_ref: "" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "activated", attemptStatus: "VERIFIED" });

    const subscription = fake.subscription("org-a")!;
    expect(subscription).toMatchObject({ plan: "PRO", status: "ACTIVE", billingCycle: "MONTHLY", renewalMode: "MANUAL",
      cancelAtPeriodEnd: false, pendingPlan: null, pendingBillingCycle: null });
    expect(subscription.currentPeriodStart.toISOString()).toBe(NOW);
    expect(subscription.currentPeriodEnd.toISOString()).toBe("2026-10-13T09:00:00.000Z");

    const attempt = fake.attempt(tranId)!;
    expect(attempt).toMatchObject({ status: "VERIFIED", providerReference: "832865", failureReason: null });
    expect(attempt.verifiedAt?.toISOString()).toBe(NOW);
    expect(attempt.periodStart?.toISOString()).toBe(NOW);
    expect(attempt.subscriptionId).toBe(subscription.id);

    // Each Check Transaction request is signed over req_time + merchant_id + tran_id.
    const checkRequest = harness.checkRequests[0];
    expect(checkRequest.tran_id).toBe(tranId);
    expect(checkRequest.hash).toBe(hmacSha512Base64(
      `${String(checkRequest.req_time)}${TEST_PAYWAY_CONFIG.merchantId}${tranId}`,
      TEST_PAYWAY_CONFIG.apiKey,
    ));
  });

  it("activates a prepaid annual subscription for one year", async () => {
    const tranId = await startCheckout("BUSINESS", "ANNUAL");
    harness.respond(tranId, approvedPayment(tranId, { amount: 1_908 }));
    await callback({ tran_id: tranId, status: "0" });

    const subscription = fake.subscription("org-a")!;
    expect(subscription).toMatchObject({ plan: "BUSINESS", billingCycle: "ANNUAL", status: "ACTIVE", renewalMode: "MANUAL" });
    expect(subscription.currentPeriodEnd.toISOString()).toBe("2027-09-13T09:00:00.000Z");
  });

  it("does not activate a declined payment", async () => {
    const tranId = await startCheckout();
    harness.respond(tranId, declinedPayment(tranId));

    const response = await callback({ tran_id: tranId, status: "0" });
    expect(await response.json()).toMatchObject({ status: "failed", attemptStatus: "FAILED" });
    expect(fake.subscriptions).toHaveLength(0);
    expect(fake.attempt(tranId)!.failureReason).toBe("PayWay reported declined.");
  });

  it("keeps an unresolved payment pending and never activates it", async () => {
    const tranId = await startCheckout();
    harness.respond(tranId, pendingPayment(tranId));

    const response = await callback({ tran_id: tranId, status: "0" });
    expect(await response.json()).toMatchObject({ status: "pending", attemptStatus: "PENDING" });
    expect(fake.subscriptions).toHaveLength(0);
  });

  it("leaves an uncertain transaction pending instead of failing or retrying it", async () => {
    const tranId = await startCheckout();
    harness.failWith(503);

    const response = await callback({ tran_id: tranId, status: "0" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "pending", attemptStatus: "PENDING" });
    expect(fake.attempt(tranId)!.status).toBe("PENDING");
    expect(fake.subscriptions).toHaveLength(0);
    expect(harness.checkRequests).toHaveLength(1);
  });

  it.each([
    ["a missing header", undefined],
    ["a malformed header", "not-a-signature"],
    ["a signature for a different key", "L1n+ZmjtXBFbryux+br+anvB/fR2uuiLqfebyOr9BiebNtQPFxNP+yop9gpjVlH3O6QOfTWGhRn5fP2HYo3fcQ=="],
  ])("rejects %s before touching the attempt", async (_label, signature) => {
    const tranId = await startCheckout();
    harness.respond(tranId, approvedPayment(tranId, { amount: 79 }));

    const response = signature === undefined
      ? await fetch(`${baseUrl}/api/subscriptions/payway/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tran_id: tranId, status: "0" }),
        })
      : await callback({ tran_id: tranId, status: "0" }, signature);

    expect(response.status).toBe(401);
    expect(fake.attempt(tranId)!.status).toBe("PENDING");
    expect(fake.subscriptions).toHaveLength(0);
    expect(harness.checkRequests).toHaveLength(0);
  });

  it("rejects a body whose signature does not cover it", async () => {
    const tranId = await startCheckout();
    const signed = callbackSignature({ tran_id: tranId, status: "0" }, TEST_PAYWAY_CONFIG.apiKey)!;
    const response = await callback({ tran_id: tranId, status: "0", amount: "1.00" }, signed);
    expect(response.status).toBe(401);
    expect(fake.attempt(tranId)!.status).toBe("PENDING");
  });

  it("refuses to activate when PayWay reports a different amount", async () => {
    const tranId = await startCheckout("PRO", "MONTHLY");
    harness.respond(tranId, approvedPayment(tranId, { amount: 0.01 }));

    const response = await callback({ tran_id: tranId, status: "0" });
    expect(await response.json()).toMatchObject({ status: "rejected", attemptStatus: "FAILED" });
    expect(fake.subscriptions).toHaveLength(0);
    expect(fake.attempt(tranId)!.failureReason).toContain("amount did not match");
  });

  it("refuses to activate when PayWay reports a different currency", async () => {
    const tranId = await startCheckout("PRO", "MONTHLY");
    harness.respond(tranId, approvedPayment(tranId, { amount: 79, currency: "KHR" }));

    const response = await callback({ tran_id: tranId, status: "0" });
    expect(await response.json()).toMatchObject({ status: "rejected", attemptStatus: "FAILED" });
    expect(fake.subscriptions).toHaveLength(0);
    expect(fake.attempt(tranId)!.failureReason).toContain("currency did not match");
  });

  it("cannot be told what to do by the callback body: provider status wins", async () => {
    const declined = await startCheckout();
    harness.respond(declined, declinedPayment(declined));
    expect(await (await callback({ tran_id: declined, status: "0" })).json()).toMatchObject({ status: "failed" });
    expect(fake.subscriptions).toHaveLength(0);

    const approved = await startCheckout("PLUS", "MONTHLY");
    harness.respond(approved, approvedPayment(approved, { amount: 29 }));
    // The pushback claims failure, but PayWay's own record says approved.
    expect(await (await callback({ tran_id: approved, status: "201" })).json()).toMatchObject({ status: "activated" });
    expect(fake.subscription("org-a")).toMatchObject({ plan: "PLUS" });
  });

  it("never trusts a workspace identifier from the callback payload", async () => {
    const tranId = await startCheckout("PRO", "MONTHLY");
    harness.respond(tranId, approvedPayment(tranId, { amount: 79 }));

    const response = await callback({ tran_id: tranId, status: "0", organizationId: "org-b", organization_id: "org-b" });
    expect(await response.json()).toMatchObject({ status: "activated" });
    expect(fake.subscriptions.map((row) => row.organizationId)).toEqual(["org-a"]);
  });

  it("answers 404 for an unknown transaction", async () => {
    const response = await callback({ tran_id: "EVLUNKNOWN000000001", status: "0" });
    expect(response.status).toBe(404);
  });

  it("requires tran_id", async () => {
    const response = await callback({ status: "0" });
    expect(response.status).toBe(400);
  });

  it("extends the paid period exactly once for a duplicate callback", async () => {
    const tranId = await startCheckout("PRO", "MONTHLY");
    harness.respond(tranId, approvedPayment(tranId, { amount: 79 }));

    expect(await (await callback({ tran_id: tranId, status: "0" })).json()).toMatchObject({ status: "activated" });
    const after = fake.subscription("org-a")!.currentPeriodEnd.toISOString();

    const duplicate = await callback({ tran_id: tranId, status: "0" });
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ status: "already_processed", attemptStatus: "VERIFIED" });
    expect(fake.subscription("org-a")!.currentPeriodEnd.toISOString()).toBe(after);
  });
});

describe("renewal", () => {
  it("appends a prepaid month after the period already paid for", async () => {
    fake.seedSubscription({ organizationId: "org-a", plan: "PRO", billingCycle: "MONTHLY", currentPeriodEnd: new Date(MONTH_END) });
    const { body } = await checkout("PRO", "MONTHLY");
    expect(body.purpose).toBe("RENEWAL");

    const tranId = String(body.tranId);
    harness.respond(tranId, approvedPayment(tranId, { amount: 79 }));
    expect(await (await callback({ tran_id: tranId, status: "0" })).json()).toMatchObject({ status: "activated" });

    const subscription = fake.subscription("org-a")!;
    expect(subscription.currentPeriodStart.toISOString()).toBe(MONTH_END);
    expect(subscription.currentPeriodEnd.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(subscription.plan).toBe("PRO");
  });

  it("extends an annual renewal by one year", async () => {
    fake.seedSubscription({ organizationId: "org-a", plan: "PLUS", billingCycle: "ANNUAL", currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z") });
    const { body } = await checkout("PLUS", "ANNUAL");
    harness.respond(String(body.tranId), approvedPayment(String(body.tranId), { amount: 276 }));
    await callback({ tran_id: String(body.tranId), status: "0" });

    expect(fake.subscription("org-a")!.currentPeriodEnd.toISOString()).toBe("2028-01-01T00:00:00.000Z");
  });

  it("starts a fresh period at payment time when the old one already lapsed", async () => {
    fake.seedSubscription({ organizationId: "org-a", plan: "PRO", status: "EXPIRED", currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z") });
    const { body } = await checkout("BUSINESS", "MONTHLY");
    expect(body.purpose).toBe("RENEWAL");
    harness.respond(String(body.tranId), approvedPayment(String(body.tranId), { amount: 199 }));
    await callback({ tran_id: String(body.tranId), status: "0" });

    const subscription = fake.subscription("org-a")!;
    expect(subscription).toMatchObject({ plan: "BUSINESS", status: "ACTIVE" });
    expect(subscription.currentPeriodStart.toISOString()).toBe(NOW);
  });

  it("does not double-extend on a duplicate renewal callback", async () => {
    fake.seedSubscription({ organizationId: "org-a", plan: "PRO", billingCycle: "MONTHLY", currentPeriodEnd: new Date(MONTH_END) });
    const { body } = await checkout("PRO", "MONTHLY");
    const tranId = String(body.tranId);
    harness.respond(tranId, approvedPayment(tranId, { amount: 79 }));

    await callback({ tran_id: tranId, status: "0" });
    const firstEnd = fake.subscription("org-a")!.currentPeriodEnd.toISOString();
    await callback({ tran_id: tranId, status: "0" });
    await callback({ tran_id: tranId, status: "0" });

    expect(fake.subscription("org-a")!.currentPeriodEnd.toISOString()).toBe(firstEnd);
    expect(firstEnd).toBe("2026-11-01T00:00:00.000Z");
  });

  it("clears a scheduled cancellation when the workspace pays for another period", async () => {
    fake.seedSubscription({ organizationId: "org-a", currentPeriodEnd: new Date(MONTH_END), cancelAtPeriodEnd: true });
    const { body } = await checkout("PRO", "MONTHLY");
    harness.respond(String(body.tranId), approvedPayment(String(body.tranId), { amount: 79 }));
    await callback({ tran_id: String(body.tranId), status: "0" });

    expect(fake.subscription("org-a")!.cancelAtPeriodEnd).toBe(false);
  });

  it("activates when the customer returns and polls, even if no callback was ever delivered", async () => {
    const { body } = await checkout("PRO", "MONTHLY");
    const tranId = String(body.tranId);
    harness.respond(tranId, approvedPayment(tranId, { amount: 79 }));

    const response = await get(`/subscriptions/attempts/${tranId}`);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { status: string; subscription: { plan: string; currentPeriodEnd: string } | null };
    expect(payload.status).toBe("VERIFIED");
    // Activation still came from PayWay's answer, never from the return URL.
    expect(payload.subscription).toMatchObject({ plan: "PRO", currentPeriodEnd: "2026-10-13T09:00:00.000Z" });
    expect(await (await get("/subscriptions/current")).json()).toMatchObject({ plan: "PRO", renewalMode: "MANUAL" });
  });

  it("keeps polling safe while a payment is still unconfirmed", async () => {
    const { body } = await checkout("PRO", "MONTHLY");
    const tranId = String(body.tranId);
    harness.respond(tranId, pendingPayment(tranId));

    const payload = (await (await get(`/subscriptions/attempts/${tranId}`)).json()) as { status: string; subscription: unknown };
    expect(payload.status).toBe("PENDING");
    expect(payload.subscription).toBeNull();
  });

  it("hides another workspace's attempt and unknown transaction ids", async () => {
    const { body } = await checkout("PRO", "MONTHLY");
    expect((await get(`/subscriptions/attempts/${body.tranId}`, token("organization", "org-b"))).status).toBe(404);
    expect((await get("/subscriptions/attempts/EVLUNKNOWN000000001")).status).toBe(404);
    expect((await get(`/subscriptions/attempts/${body.tranId}`, null)).status).toBe(401);
  });

  it("lets a non-owner view payment state without letting them start one", async () => {
    const { body } = await checkout("PRO", "MONTHLY");
    expect((await get(`/subscriptions/attempts/${body.tranId}`, token("interviewer"))).status).toBe(200);
    expect((await post("/subscriptions/checkout", { plan: "PRO", billingCycle: "MONTHLY" }, token("interviewer"))).status).toBe(403);
  });
});

describe("plan changes", () => {
  it("records a paid downgrade and applies it only when the paid period ends", async () => {
    fake.seedSubscription({ organizationId: "org-a", plan: "BUSINESS", billingCycle: "MONTHLY", currentPeriodEnd: new Date(MONTH_END) });
    const { body } = await checkout("PLUS", "MONTHLY");
    expect(body.purpose).toBe("PLAN_CHANGE");

    const tranId = String(body.tranId);
    harness.respond(tranId, approvedPayment(tranId, { amount: 29 }));
    expect(await (await callback({ tran_id: tranId, status: "0" })).json()).toMatchObject({ status: "scheduled" });

    const beforeEnd = fake.subscription("org-a")!;
    expect(beforeEnd).toMatchObject({ plan: "BUSINESS", billingCycle: "MONTHLY", pendingPlan: "PLUS", pendingBillingCycle: "MONTHLY" });
    expect(beforeEnd.currentPeriodEnd.toISOString()).toBe(MONTH_END);
    expect(fake.attempt(tranId)!.periodStart?.toISOString()).toBe(MONTH_END);

    // Still the old plan right up to the end of the period that was paid for.
    fake.setNow("2026-09-30T23:00:00.000Z");
    expect(await (await get("/subscriptions/current")).json()).toMatchObject({ plan: "BUSINESS", pendingPlan: "PLUS" });

    fake.setNow(MONTH_END);
    const applied = (await (await get("/subscriptions/current")).json()) as Record<string, unknown>;
    expect(applied).toMatchObject({ plan: "PLUS", billingCycle: "MONTHLY", pendingPlan: null, pendingBillingCycle: null });
    expect(applied.currentPeriodStart).toBe(MONTH_END);
    expect(applied.currentPeriodEnd).toBe("2026-11-01T00:00:00.000Z");
  });

  it("applies a paid plan change immediately when the old period already ended", async () => {
    fake.seedSubscription({ organizationId: "org-a", plan: "PLUS", status: "EXPIRED", currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z") });
    const { body } = await checkout("BUSINESS", "ANNUAL");
    expect(body.purpose).toBe("RENEWAL");

    harness.respond(String(body.tranId), approvedPayment(String(body.tranId), { amount: 1_908 }));
    await callback({ tran_id: String(body.tranId), status: "0" });

    const subscription = fake.subscription("org-a")!;
    expect(subscription).toMatchObject({ plan: "BUSINESS", billingCycle: "ANNUAL", status: "ACTIVE", pendingPlan: null });
    expect(subscription.currentPeriodEnd.toISOString()).toBe("2027-09-13T09:00:00.000Z");
  });

  it("expires instead of extending when an applied change is already past its paid period", async () => {
    fake.seedSubscription({ organizationId: "org-a", plan: "PRO", currentPeriodEnd: new Date(MONTH_END), pendingPlan: "BUSINESS", pendingBillingCycle: "MONTHLY" });
    fake.setNow("2026-12-15T00:00:00.000Z");

    expect(await (await get("/subscriptions/current")).json()).toMatchObject({
      plan: "BUSINESS",
      status: "EXPIRED",
      currentPeriodStart: MONTH_END,
      currentPeriodEnd: "2026-11-01T00:00:00.000Z",
    });
  });
});

describe("POST /subscriptions/cancel", () => {
  it("keeps access until the end of the paid period and stops there", async () => {
    fake.seedSubscription({ organizationId: "org-a", currentPeriodEnd: new Date(MONTH_END) });
    const response = await post("/subscriptions/cancel", {});
    expect(response.status).toBe(201);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ cancelAtPeriodEnd: true, status: "ACTIVE", plan: "PRO" });
    expect(body.currentPeriodEnd).toBe(MONTH_END);
    expect(body.currentPeriodStart).toBe("2026-09-01T00:00:00.000Z");
    // Manual billing never created a future charge, so nothing needed revoking.
    expect(fake.attempts).toHaveLength(0);
  });

  it("requires the workspace owner", async () => {
    fake.seedSubscription({ organizationId: "org-a" });
    for (const role of ["interviewer", "admin", "candidate"]) {
      expect((await post("/subscriptions/cancel", {}, token(role))).status).toBe(403);
    }
    expect((await post("/subscriptions/cancel", {}, null)).status).toBe(401);
    expect(fake.subscription("org-a")!.cancelAtPeriodEnd).toBe(false);
  });

  it("rejects cancelling nothing or an already ended subscription", async () => {
    expect((await post("/subscriptions/cancel", {})).status).toBe(404);

    fake.seedSubscription({ organizationId: "org-a", status: "EXPIRED", currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z") });
    expect((await post("/subscriptions/cancel", {})).status).toBe(409);
  });

  it("refuses to forfeit a plan change the workspace already paid for", async () => {
    fake.seedSubscription({ organizationId: "org-a", pendingPlan: "BUSINESS", pendingBillingCycle: "MONTHLY" });
    const response = await post("/subscriptions/cancel", {});
    expect(response.status).toBe(409);
    expect((await response.json()).message).toContain("paid plan change");
    expect(fake.subscription("org-a")!.cancelAtPeriodEnd).toBe(false);
  });

  it("lets a later payment win over a scheduled cancellation", async () => {
    fake.seedSubscription({ organizationId: "org-a", currentPeriodEnd: new Date(MONTH_END), cancelAtPeriodEnd: true });
    const { body } = await checkout("PRO", "MONTHLY");
    harness.respond(String(body.tranId), approvedPayment(String(body.tranId), { amount: 79 }));
    await callback({ tran_id: String(body.tranId), status: "0" });

    const subscription = fake.subscription("org-a")!;
    expect(subscription).toMatchObject({ cancelAtPeriodEnd: false, status: "ACTIVE" });
    expect(subscription.currentPeriodEnd.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});


describe("sandbox billing tester authorization", () => {
  const keys = ["NODE_ENV", "PAYWAY_ENV", "BILLING_TESTER_EMAILS"] as const;
  let previous: (string | undefined)[];
  beforeEach(() => {
    previous = keys.map((key) => process.env[key]);
    process.env.BILLING_TESTER_EMAILS = " jingjingmiffy@gmail.com, second@example.invalid ";
  });
  afterEach(() => {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  });

  it.each([
    ["interviewer", "jingjingmiffy@gmail.com", "sandbox", "development", true],
    ["interviewer", "JINGJINGMIFFY@gmail.com", "sandbox", "test", true],
    ["interviewer", "other@example.invalid", "sandbox", "development", false],
    ["organization", "owner@example.invalid", "production", "production", true],
    ["interviewer", "jingjingmiffy@gmail.com", "production", "development", false],
    ["interviewer", "jingjingmiffy@gmail.com", "sandbox", "production", false],
    ["interviewer", "jingjingmiffy@gmail.com", "sandbox", "", false],
    ["candidate", "jingjingmiffy@gmail.com", "sandbox", "development", false],
    ["admin", "jingjingmiffy@gmail.com", "sandbox", "development", false],
  ])("%s %s PayWay=%s NODE_ENV=%s allowed=%s", async (role, email, paywayEnv, nodeEnv, allowed) => {
    process.env.PAYWAY_ENV = paywayEnv;
    process.env.NODE_ENV = nodeEnv;
    const auth = token(role, "org-a", email);
    const permission = await get("/subscriptions/permissions", auth);
    if (role === "candidate") expect(permission.status).toBe(403);
    else expect(await permission.json()).toEqual({ canManageBilling: allowed });
    for (const plan of ["PLUS", "PRO", "BUSINESS"]) {
      const result = await checkout(plan, "MONTHLY", auth);
      expect(result.response.status).toBe(allowed ? 201 : 403);
    }
    if (!allowed) expect((await post("/subscriptions/cancel", {}, auth)).status).toBe(403);
  });

  it.each([
    ["interviewer", "sandbox", "development", "org-a", true],
    ["interviewer", "sandbox", "test", "org-a", true],
    ["interviewer", "production", "development", "org-a", false],
    ["interviewer", "sandbox", "production", "org-a", false],
    ["interviewer", "sandbox", "development", null, false],
    ["candidate", "sandbox", "development", "org-a", false],
    ["admin", "sandbox", "development", "org-a", false],
  ])("wildcard: %s %s %s workspace=%s allowed=%s", async (role, environment, nodeEnv, organizationId, allowed) => {
    process.env.BILLING_TESTER_EMAILS = " * ";
    process.env.PAYWAY_ENV = environment;
    process.env.NODE_ENV = nodeEnv;
    for (const email of ["new-interviewer@example.invalid", "another@example.invalid"]) {
      const auth = token(role, organizationId, email);
      const result = await checkout("PLUS", "MONTHLY", auth);
      expect(result.response.status).toBe(allowed ? 201 : 403);
      const permission = await get("/subscriptions/permissions", auth);
      if (role === "candidate" || !organizationId) expect(permission.status).toBe(403);
      else expect(await permission.json()).toEqual({ canManageBilling: allowed });
    }
  });

  it("requires workspace membership and an explicit allowlist", async () => {
    process.env.NODE_ENV = "development";
    process.env.PAYWAY_ENV = "sandbox";
    expect((await checkout("PLUS", "MONTHLY", token("interviewer", null, "jingjingmiffy@gmail.com"))).response.status).toBe(403);
    delete process.env.BILLING_TESTER_EMAILS;
    expect((await checkout("PLUS", "MONTHLY", token("interviewer", "org-a", "jingjingmiffy@gmail.com"))).response.status).toBe(403);
  });
});


describe("subscription recovery after a missed payment return", () => {
  it("verifies a paid Plus attempt when loading the profile, without double activation", async () => {
    const { body } = await checkout("PLUS", "MONTHLY");
    const tranId = String(body.tranId);
    harness.respond(tranId, approvedPayment(tranId, { amount: 29 }));
    const response = await get("/subscriptions/current", token("interviewer"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ plan: "PLUS", status: "ACTIVE" });
    expect(fake.attempt(tranId)?.status).toBe("VERIFIED");
    const end = fake.subscription("org-a")?.currentPeriodEnd.toISOString();
    await get("/subscriptions/current");
    expect(fake.subscription("org-a")?.currentPeriodEnd.toISOString()).toBe(end);
  });

  it("does not activate an unconfirmed payment or another workspace's payment", async () => {
    const { body } = await checkout("PLUS", "MONTHLY");
    expect(await (await get("/subscriptions/current")).json()).toBeNull();
    harness.respond(String(body.tranId), approvedPayment(String(body.tranId), { amount: 29 }));
    expect(await (await get("/subscriptions/current", token("interviewer", "org-b"))).json()).toBeNull();
    expect(fake.attempt(String(body.tranId))?.status).toBe("PENDING");
  });
});


describe("immediate paid upgrades", () => {
  it.each([["PLUS", "PRO", 79], ["PLUS", "BUSINESS", 199], ["PRO", "BUSINESS", 199]] as const)("activates %s to %s only after verification", async (from, to, amount) => {
    fake.seedSubscription({ organizationId: "org-a", plan: from, currentPeriodEnd: new Date(MONTH_END) });
    const { body } = await checkout(to, "MONTHLY");
    const tranId = String(body.tranId);
    expect(fake.subscription("org-a")?.plan).toBe(from);
    harness.respond(tranId, approvedPayment(tranId, { amount }));
    expect(await (await callback({ tran_id: tranId, status: "0" })).json()).toMatchObject({ status: "activated" });
    expect(fake.subscription("org-a")).toMatchObject({ plan: to, pendingPlan: null, currentPeriodStart: new Date(NOW), currentPeriodEnd: new Date("2026-11-01T00:00:00.000Z") });
    await callback({ tran_id: tranId, status: "0" });
    expect(fake.subscription("org-a")?.currentPeriodEnd.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});
