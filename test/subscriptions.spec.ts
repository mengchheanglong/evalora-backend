import "reflect-metadata";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import * as jwt from "jsonwebtoken";
import { SubscriptionsController } from "../src/modules/subscriptions/subscriptions.controller";
import { SubscriptionsService } from "../src/modules/subscriptions/subscriptions.service";
import type { BillingCycle, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { JwtAuthGuard, RolesGuard } from "../src/modules/auth/auth.guard";
import { BillingFake, createPayWayHarness } from "./common/billing-fake";

const periodStart = new Date("2026-09-01T00:00:00.000Z");
const periodEnd = new Date("2026-10-01T00:00:00.000Z");

const fake = new BillingFake();
const service = new SubscriptionsService(fake.asPrismaService(), createPayWayHarness().gateway, () => fake.now);
const findSubscription = jest.spyOn(fake.client.subscription, "findUnique");

@Module({
  controllers: [SubscriptionsController],
  providers: [JwtAuthGuard, RolesGuard, { provide: SubscriptionsService, useValue: service }],
})
class TestModule {}

let app: INestApplication;
let baseUrl: string;
const previousSecret = process.env.JWT_SECRET;

beforeAll(async () => {
  process.env.JWT_SECRET = "subscription-tests-only-secret";
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
  fake.subscriptions.length = 0;
  fake.attempts.length = 0;
  findSubscription.mockClear();
});

function request(role = "interviewer", organizationId: string | null = "org-a", query = "") {
  const token = jwt.sign({ sub: "test-user", email: "test@example.invalid", role,
    ...(organizationId ? { organizationId } : {}), purpose: "session" }, process.env.JWT_SECRET!);
  return fetch(`${baseUrl}/api/subscriptions/current${query}`, { headers: { Authorization: `Bearer ${token}` } });
}
function seed(plan: SubscriptionPlan = "PRO", status: SubscriptionStatus = "ACTIVE", billingCycle: BillingCycle = "MONTHLY") {
  fake.seedSubscription({ plan, status, billingCycle, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd });
}

test.each([["PLUS"], ["PRO"], ["BUSINESS"]] as Array<[SubscriptionPlan]>)("returns the real %s record with ISO dates and no provider identifiers", async (plan) => {
  seed(plan);
  const response = await request();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ plan, status: "ACTIVE", billingCycle: "MONTHLY",
    renewalMode: "MANUAL", currentPeriodStart: periodStart.toISOString(), currentPeriodEnd: periodEnd.toISOString(),
    cancelAtPeriodEnd: false, pendingPlan: null, pendingBillingCycle: null,
    createdAt: periodStart.toISOString(), updatedAt: periodStart.toISOString() });
});
test("no subscription returns explicit JSON null and does not create a plan", async () => {
  const response = await request();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await response.text()).toBe("null");
  expect(fake.subscriptions).toHaveLength(0);
});
test.each([["ACTIVE"], ["TRIALING"], ["PAST_DUE"], ["CANCELLED"], ["EXPIRED"]] as Array<[SubscriptionStatus]>)("preserves %s status and annual billing", async (status) => {
  seed("BUSINESS", status, "ANNUAL");
  fake.subscription("org-a")!.cancelAtPeriodEnd = true;
  expect(await (await request()).json()).toMatchObject({ status, billingCycle: "ANNUAL", cancelAtPeriodEnd: true });
});
test.each(["organization", "interviewer", "admin"])("%s is scoped to its own organization regardless of query parameters", async (role) => {
  seed();
  fake.seedSubscription({ id: "sub-2", organizationId: "org-b", plan: "BUSINESS" });
  expect(await (await request(role, "org-a", "?organizationId=org-b")).json()).toMatchObject({ plan: "PRO" });
  expect(findSubscription.mock.calls[0][0]).toEqual({ where: { organizationId: "org-a" } });
  expect(await (await request(role, "org-without-plan")).json()).toBeNull();
});
test("missing authentication is rejected before any database query", async () => {
  expect((await fetch(`${baseUrl}/api/subscriptions/current`)).status).toBe(401);
  expect(findSubscription).not.toHaveBeenCalled();
});
test("candidate access and missing workspace membership are rejected", async () => {
  expect((await request("candidate")).status).toBe(403);
  expect((await request("interviewer", null)).status).toBe(403);
  expect((await request("admin", null)).status).toBe(403);
  expect(findSubscription).not.toHaveBeenCalled();
});
test("database errors remain errors rather than masquerading as no subscription", async () => {
  findSubscription.mockRejectedValueOnce(new Error("database unavailable"));
  expect((await request()).status).toBe(500);
});
test("a paid plan change is applied once the period it replaces has ended", async () => {
  seed("PRO", "ACTIVE", "MONTHLY");
  Object.assign(fake.subscription("org-a")!, { pendingPlan: "BUSINESS", pendingBillingCycle: "ANNUAL" });

  fake.setNow("2026-09-30T00:00:00.000Z");
  expect(await (await request()).json()).toMatchObject({ plan: "PRO", pendingPlan: "BUSINESS" });

  fake.setNow("2026-10-01T00:00:00.000Z");
  expect(await (await request()).json()).toEqual({
    plan: "BUSINESS",
    status: "ACTIVE",
    billingCycle: "ANNUAL",
    renewalMode: "MANUAL",
    currentPeriodStart: periodEnd.toISOString(),
    currentPeriodEnd: "2027-10-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    pendingPlan: null,
    pendingBillingCycle: null,
    createdAt: periodStart.toISOString(),
    updatedAt: "2026-10-01T00:00:00.000Z",
  });
});
