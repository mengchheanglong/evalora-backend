import { SubscriptionsService } from "../src/modules/subscriptions/subscriptions.service";
import { BillingFake, createPayWayHarness } from "./common/billing-fake";

describe("subscription usage", () => {
  const fake = new BillingFake();
  const count = jest.fn().mockResolvedValue(12);
  const prisma = Object.assign(fake.asPrismaService(), { interviewSession: { count } });
  const service = new SubscriptionsService(prisma, createPayWayHarness().gateway, () => new Date("2026-09-15T12:00:00Z"));
  beforeEach(() => { fake.reset(); count.mockReset(); count.mockResolvedValue(12); });
  it.each([["PLUS", 50], ["PRO", 250], ["BUSINESS", null]] as const)("reports %s allowance with workspace and month boundaries", async (plan, limit) => {
    fake.seedSubscription({ plan, currentPeriodEnd: new Date("2026-10-15T12:00:00Z") });
    const result = await service.getUsage({ userId: "member", role: "interviewer", organizationId: "org-a" });
    expect(result).toEqual({ sessionsUsed: 12, sessionLimit: limit, periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-10-01T00:00:00.000Z" });
    expect(count).toHaveBeenCalledWith({ where: { organizationId: "org-a", startedAt: { gte: new Date(result.periodStart), lt: new Date(result.periodEnd) } } });
  });
  it("excludes unused invitations and counts starts in this workspace and month", async () => {
    const sessions = [
      { organizationId: "org-a", startedAt: null },
      { organizationId: "org-a", startedAt: new Date("2026-08-31T23:59:59Z") },
      { organizationId: "org-a", startedAt: new Date("2026-09-01T00:00:00Z") },
      { organizationId: "org-a", startedAt: new Date("2026-09-15T10:00:00Z") },
      { organizationId: "org-a", startedAt: new Date("2026-10-01T00:00:00Z") },
      { organizationId: "org-b", startedAt: new Date("2026-09-15T10:00:00Z") },
    ];
    count.mockImplementation(async ({ where }) => sessions.filter((session) =>
      session.organizationId === where.organizationId && session.startedAt !== null
      && session.startedAt >= where.startedAt.gte && session.startedAt < where.startedAt.lt,
    ).length);
    fake.seedSubscription({ plan: "PRO", currentPeriodEnd: new Date("2026-10-15T12:00:00Z") });
    expect((await service.getUsage({ userId: "member", role: "interviewer", organizationId: "org-a" })).sessionsUsed).toBe(2);
  });
  it("does not expose usage without workspace authorization", async () => {
    await expect(service.getUsage({ userId: "outsider", role: "candidate", organizationId: "org-a" })).rejects.toThrow();
    await expect(service.getUsage({ userId: "member", role: "interviewer" })).rejects.toThrow();
    expect(count).not.toHaveBeenCalled();
  });
  it("has no paid allowance without a subscription", async () => {
    expect((await service.getUsage({ userId: "member", role: "interviewer", organizationId: "org-a" })).sessionLimit).toBe(0);
  });
});
