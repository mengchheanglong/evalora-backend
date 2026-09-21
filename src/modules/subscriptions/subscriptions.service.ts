import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { PaymentAttempt, Subscription } from "@prisma/client";
import { randomBytes } from "node:crypto";
import type { PrismaService } from "../../prisma/prisma.service";
import { requireOrganizationId, type AccessContext as WorkspaceAccessContext } from "../auth/access-control";
import type { BillingDb } from "./billing-store";
import {
  BILLING_CURRENCY,
  addBillingCycle,
  cycleLabel,
  formatAmount,
  isBillingCycle,
  isSubscriptionPlan,
  planPrice,
  type BillingCycleName,
  type SubscriptionPlanName,
} from "./plan-catalog";
import {
  PayWayConfigurationError,
  compareTransactionToExpectation,
  describeRejection,
  interpretPaymentOutcome,
  type PayWayGateway,
  type PayWayTransactionVerification,
} from "./payway";

type AccessContext = WorkspaceAccessContext & { email?: string };

/**
 * Prepaid, manual-renewal billing.
 *
 * Invariants this service exists to hold:
 * - The backend catalog is the only source of price; the request carries a plan
 *   and a cycle, never an amount.
 * - A subscription is activated or extended only by a payment that the backend
 *   itself confirmed with PayWay's Check Transaction API. A redirect, a query
 *   parameter, or a callback body alone never grants anything.
 * - One verified payment grants exactly one billing cycle. The PENDING →
 *   VERIFIED transition is the claim, so duplicate callbacks, concurrent
 *   reconciliation, and repeated polling cannot extend a period twice.
 * - There is no stored payment credential and no automatic charge. Every
 *   renewal is a new customer-initiated checkout.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payway: PayWayGateway,
    /** Injectable clock so period math is testable without freezing globals. */
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async getUsage(access: AccessContext) {
    const organizationId = this.requireViewer(access);
    const now = this.clock();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const subscription = await this.applyDuePlanChange(organizationId, now);
    const active = subscription?.status === "ACTIVE" && subscription.currentPeriodEnd > now;
    const limits = { PLUS: 50, PRO: 250, BUSINESS: null };
    const sessionsUsed = await this.prisma.interviewSession.count({
      where: { organizationId, createdAt: { gte: periodStart, lt: periodEnd } },
    });
    return { sessionsUsed, sessionLimit: active ? limits[subscription.plan] : 0,
      periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() };
  }

  getBillingPermissions(access: AccessContext) {
    this.requireViewer(access);
    return { canManageBilling: this.canManageBilling(access) };
  }

  private canManageBilling(access: AccessContext): boolean {
    if (access.role === "organization") return true;
    const email = access.email?.trim().toLowerCase();
    return access.role === "interviewer"
      && ["development", "test"].includes(process.env.NODE_ENV ?? "")
      && process.env.PAYWAY_ENV === "sandbox"
      && Boolean(email && (process.env.BILLING_TESTER_EMAILS ?? "")
        .split(",").some((entry) => entry.trim() === "*" || entry.trim().toLowerCase() === email));
  }

  /** Read-only view. Reconciles a paid plan change that is now due, then returns stored state. */
  async getCurrent(access: AccessContext) {
    const organizationId = this.requireViewer(access);
    // Recover a missed callback/return redirect using provider verification only.
    const pending = await this.prisma.paymentAttempt.findFirst({
      where: { organizationId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (pending && this.payway.isConfigured()) await this.reconcileAttempt(pending);
    const subscription = await this.applyDuePlanChange(organizationId);
    return subscription ? serializeSubscription(subscription) : null;
  }

  /**
   * Starts a prepaid checkout for an owner or an explicitly enabled sandbox tester.
   */
  async checkout(access: AccessContext, input: { plan?: unknown; billingCycle?: unknown } | undefined) {
    const organizationId = this.requireBillingOwner(access);

    const requestedPlan: unknown = input?.plan;
    const requestedCycle: unknown = input?.billingCycle;
    if (!isSubscriptionPlan(requestedPlan)) {
      throw new BadRequestException("Plan must be PLUS, PRO, or BUSINESS.");
    }
    if (!isBillingCycle(requestedCycle)) {
      throw new BadRequestException("Billing cycle must be MONTHLY or ANNUAL.");
    }

    const plan: SubscriptionPlanName = requestedPlan;
    const billingCycle: BillingCycleName = requestedCycle;
    const amountMinor = planPrice(plan, billingCycle);
    // Resolved before anything is written, so an unconfigured environment never
    // leaves a stray PENDING attempt behind.
    const gateway = this.requirePayWay();
    const now = this.clock();

    const subscription = await this.applyDuePlanChange(organizationId, now);
    const purpose = decidePurpose(subscription, plan, billingCycle, now);

    if (purpose === "PLAN_CHANGE" && subscription?.pendingPlan) {
      throw new ConflictException(
        subscription.pendingPlan === plan && subscription.pendingBillingCycle === billingCycle
          ? "That plan is already scheduled for the end of the current period."
          : "A plan change is already scheduled for the end of the current period.",
      );
    }

    const attempt = await this.claimOrCreateAttempt({
      organizationId,
      subscriptionId: subscription?.id ?? null,
      plan,
      billingCycle,
      purpose,
      amountMinor,
      now,
    });

    return {
      attemptId: attempt.id,
      tranId: attempt.tranId,
      plan: attempt.plan,
      billingCycle: attempt.billingCycle,
      amountMinor: attempt.amountMinor,
      amountDisplay: formatAmount(attempt.amountMinor),
      currency: attempt.currency,
      purpose: attempt.purpose,
      paidPeriod: cycleLabel(attempt.billingCycle),
      checkout: gateway.createCheckoutSession({
        tranId: attempt.tranId,
        plan: attempt.plan,
        billingCycle: attempt.billingCycle,
        amountMinor: attempt.amountMinor,
        currency: attempt.currency,
        requestedAt: now,
      }),
    };
  }

  /**
   * Payment status for the "Confirming payment…" screen. Unlike the redirect
   * parameters, this asks PayWay and activates only what PayWay confirms.
   */
  async getAttempt(access: AccessContext, tranId: string) {
    const organizationId = this.requireViewer(access);
    const attempt = await this.prisma.paymentAttempt.findUnique({ where: { tranId } });
    // Never trust a workspace identifier from the caller: the attempt's own row decides.
    if (!attempt || attempt.organizationId !== organizationId) {
      throw new NotFoundException("Payment attempt not found.");
    }

    const reconciled = attempt.status === "PENDING" ? await this.reconcileAttempt(attempt) : null;
    const current = reconciled?.attempt ?? attempt;
    const subscription = await this.applyDuePlanChange(organizationId);
    return {
      ...serializeAttempt(current),
      subscription: subscription ? serializeSubscription(subscription) : null,
    };
  }

  /**
   * Cancel at period end. There is no automatic charge to stop, so cancellation
   * only records intent; access runs to `currentPeriodEnd` and lapses by itself.
   */
  async cancel(access: AccessContext) {
    const organizationId = this.requireBillingOwner(access);
    const now = this.clock();
    const subscription = await this.applyDuePlanChange(organizationId, now);
    if (!subscription) throw new NotFoundException("No subscription to cancel.");
    if (subscription.status === "CANCELLED" || subscription.status === "EXPIRED" || subscription.currentPeriodEnd <= now) {
      throw new ConflictException("This subscription has already ended.");
    }
    if (subscription.pendingPlan) {
      // The workspace already paid for a plan change. Cancelling silently would
      // forfeit that period, so it needs a human decision instead.
      throw new ConflictException(
        "A paid plan change is scheduled for the end of this period. Contact support to cancel it.",
      );
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    });
    return serializeSubscription(updated);
  }

  /**
   * PayWay payment pushback. Unauthenticated by design — the HMAC header is the
   * credential — and the transaction is only ever resolved by its own stored
   * `tran_id`, never by anything the body claims about a workspace.
   */
  async handlePayWayCallback(payload: unknown, signature: string | undefined) {
    const gateway = this.requirePayWay();
    if (!gateway.verifyCallbackSignature(payload, signature)) {
      throw new UnauthorizedException("Invalid PayWay callback signature.");
    }

    const tranId = readTranId(payload);
    if (!tranId) throw new BadRequestException("tran_id is required.");

    const attempt = await this.prisma.paymentAttempt.findUnique({ where: { tranId } });
    if (!attempt) throw new NotFoundException("Unknown PayWay transaction.");

    // The pushback body is deliberately not used to decide the outcome: it is
    // only a trigger to ask PayWay, which is the authoritative source of truth.
    const result = await this.reconcileAttempt(attempt);
    return { status: result.status, tranId, attemptStatus: result.attempt.status };
  }

  /** Authenticated retry of a single attempt, used by the return/polling screen. */
  private async reconcileAttempt(attempt: PaymentAttempt, db: BillingDb = this.database()) {
    if (attempt.status !== "PENDING") {
      return { status: "already_processed" as const, attempt };
    }

    const gateway = this.requirePayWay();
    const outcome = await gateway.checkTransaction(attempt.tranId);
    if (outcome.kind === "unavailable") {
      // Uncertain, not declined: leave the attempt PENDING and let a later
      // callback or poll reconcile it. Never fail or re-attempt blindly.
      this.logger.warn(`PayWay transaction ${attempt.tranId} not resolved: ${outcome.reason}`);
      return { status: "pending" as const, attempt };
    }

    const verification = outcome.verification;
    const expected = { amountMinor: attempt.amountMinor, currency: attempt.currency };
    const paymentOutcome = interpretPaymentOutcome(verification);

    if (paymentOutcome === "PENDING") {
      return { status: "pending" as const, attempt };
    }
    if (paymentOutcome !== "APPROVED") {
      const failed = await this.failAttempt(attempt, verification, describeRejection(paymentOutcome, expected, verification), db);
      return { status: paymentOutcome === "CANCELLED" ? ("cancelled" as const) : ("failed" as const), attempt: failed };
    }

    const { amountMatches, currencyMatches } = compareTransactionToExpectation(verification, expected);
    if (!amountMatches || !currencyMatches) {
      // A mismatched amount or currency is never activated, whatever the pushback said.
      const failed = await this.failAttempt(attempt, verification, describeRejection(paymentOutcome, expected, verification), db);
      return { status: "rejected" as const, attempt: failed };
    }

    return this.activateVerifiedPayment(attempt, verification);
  }

  /**
   * Claims the attempt and extends the subscription in one transaction. The
   * conditional PENDING update is the lock: whichever caller wins it is the only
   * one that gets to grant the paid period, so a duplicate callback and a
   * concurrent poll can never double-extend.
   */
  private async activateVerifiedPayment(attempt: PaymentAttempt, verification: PayWayTransactionVerification) {
    const verifiedAt = this.clock();

    return this.prisma.$transaction(async (transaction) => {
      const db = transaction as unknown as BillingDb;
      const claim = await db.paymentAttempt.updateMany({
        where: { id: attempt.id, status: "PENDING" },
        data: {
          status: "VERIFIED",
          verifiedAt,
          providerReference: verification.reference,
          providerStatus: verification.providerStatus,
          failureReason: null,
        },
      });
      if (claim.count === 0) {
        const settled = await db.paymentAttempt.findUnique({ where: { id: attempt.id } });
        return { status: "already_processed" as const, attempt: settled ?? attempt };
      }

      // A plan change that became due before this payment landed must be applied
      // first, so the new payment is evaluated against the real current plan.
      const subscription = await this.applyDuePlanChange(attempt.organizationId, verifiedAt, db);
      const effect = resolvePaidEffect(subscription, attempt, verifiedAt);

      // Upgrades apply immediately; downgrades and cycle-only changes are scheduled.
      const saved = subscription
        ? await db.subscription.update({
            where: { id: subscription.id },
            data:
              effect.kind === "schedule_plan_change"
                ? {
                    pendingPlan: effect.plan,
                    pendingBillingCycle: effect.billingCycle,
                    status: "ACTIVE",
                    cancelAtPeriodEnd: false,
                  }
                : {
                    plan: effect.plan,
                    billingCycle: effect.billingCycle,
                    renewalMode: "MANUAL",
                    currentPeriodStart: effect.periodStart,
                    currentPeriodEnd: effect.periodEnd,
                    status: "ACTIVE",
                    cancelAtPeriodEnd: false,
                    pendingPlan: null,
                    pendingBillingCycle: null,
                  },
          })
        : await db.subscription.create({
            data: {
              organizationId: attempt.organizationId,
              plan: effect.plan,
              status: "ACTIVE",
              billingCycle: effect.billingCycle,
              renewalMode: "MANUAL",
              currentPeriodStart: effect.periodStart,
              currentPeriodEnd: effect.periodEnd,
              cancelAtPeriodEnd: false,
            },
          });

      const settled = await db.paymentAttempt.update({
        where: { id: attempt.id },
        data: { subscriptionId: saved.id, periodStart: effect.periodStart, periodEnd: effect.periodEnd },
      });

      return {
        status: effect.kind === "schedule_plan_change" ? ("scheduled" as const) : ("activated" as const),
        attempt: settled,
        subscription: saved,
      };
    });
  }

  private async failAttempt(
    attempt: PaymentAttempt,
    verification: PayWayTransactionVerification,
    reason: string,
    db: BillingDb = this.database(),
  ) {
    await db.paymentAttempt.updateMany({
      where: { id: attempt.id, status: "PENDING" },
      data: {
        status: "FAILED",
        failureReason: reason,
        providerReference: verification.reference,
        providerStatus: verification.providerStatus,
      },
    });
    this.logger.warn(`PayWay transaction ${attempt.tranId} was not activated: ${reason}`);
    return (await db.paymentAttempt.findUnique({ where: { id: attempt.id } })) ?? attempt;
  }

  /**
   * Applies a paid plan change whose effective date has arrived. Called on read
   * and before every billing mutation — the same "reconcile then read" pattern
   * analytics uses for expired invitations. The compare-and-swap on the pending
   * columns means only one concurrent reader can apply it.
   */
  private async applyDuePlanChange(
    organizationId: string,
    now: Date = this.clock(),
    db: BillingDb = this.database(),
  ): Promise<Subscription | null> {
    const subscription = await db.subscription.findUnique({ where: { organizationId } });
    if (!subscription?.pendingPlan || !subscription.pendingBillingCycle) return subscription;
    if (subscription.currentPeriodEnd > now) return subscription;

    const periodStart = subscription.currentPeriodEnd;
    const periodEnd = addBillingCycle(periodStart, subscription.pendingBillingCycle);
    const claimed = await db.subscription.updateMany({
      where: {
        id: subscription.id,
        pendingPlan: subscription.pendingPlan,
        pendingBillingCycle: subscription.pendingBillingCycle,
      },
      data: {
        plan: subscription.pendingPlan,
        billingCycle: subscription.pendingBillingCycle,
        renewalMode: "MANUAL",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        // A paid plan change means the workspace is continuing, not leaving.
        cancelAtPeriodEnd: false,
        status: periodEnd > now ? "ACTIVE" : "EXPIRED",
        pendingPlan: null,
        pendingBillingCycle: null,
      },
    });
    if (claimed.count === 0) {
      return db.subscription.findUnique({ where: { organizationId } });
    }
    return db.subscription.findUnique({ where: { organizationId } });
  }

  /**
   * Reuses an in-flight attempt for the same plan/cycle instead of opening a
   * second PayWay transaction, so a double click or a resumed checkout cannot
   * charge twice. The unique `idempotency_key` covers the true concurrent case.
   */
  private async claimOrCreateAttempt(input: {
    organizationId: string;
    subscriptionId: string | null;
    plan: SubscriptionPlanName;
    billingCycle: BillingCycleName;
    purpose: "NEW_SUBSCRIPTION" | "RENEWAL" | "PLAN_CHANGE";
    amountMinor: number;
    now: Date;
  }): Promise<PaymentAttempt> {
    const windowStart = new Date(input.now.getTime() - CHECKOUT_REUSE_WINDOW_MS);
    const reusable = await this.prisma.paymentAttempt.findFirst({
      where: {
        organizationId: input.organizationId,
        plan: input.plan,
        billingCycle: input.billingCycle,
        status: "PENDING",
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: "desc" },
    });
    if (reusable) return reusable;

    const idempotencyKey = [
      input.organizationId,
      input.plan,
      input.billingCycle,
      Math.floor(input.now.getTime() / CHECKOUT_REUSE_WINDOW_MS),
    ].join("|");
    const base = {
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      plan: input.plan,
      billingCycle: input.billingCycle,
      purpose: input.purpose,
      amountMinor: input.amountMinor,
      currency: BILLING_CURRENCY,
      status: "PENDING" as const,
    };

    try {
      return await this.prisma.paymentAttempt.create({
        data: { ...base, tranId: createTranId(), idempotencyKey },
      });
    } catch (error) {
      if (!isIdempotencyKeyCollision(error)) throw error;
      const existing = await this.prisma.paymentAttempt.findUnique({ where: { idempotencyKey } });
      if (existing?.status === "PENDING") return existing;
      // That window's attempt already resolved, so this is a genuinely new
      // purchase; it gets a key derived from its own transaction id.
      const tranId = createTranId();
      return this.prisma.paymentAttempt.create({
        data: { ...base, tranId, idempotencyKey: `${idempotencyKey}|${tranId}` },
      });
    }
  }

  private requireViewer(access: AccessContext | undefined): string {
    if (!access) throw new UnauthorizedException("Authentication required.");
    if (!["organization", "interviewer", "admin"].includes(access.role)) {
      throw new ForbiddenException("Workspace membership is required to view subscriptions.");
    }
    // No admin bypass and no caller-supplied workspace scope.
    return requireOrganizationId(access);
  }

  /**
   * Money actions belong to the owner or an explicitly enabled sandbox tester. An admin can read
   * billing but cannot spend a customer's money, which is why this is stricter
   * than the shared "workspace owner or admin" helper used for member management.
   */
  private requireBillingOwner(access: AccessContext | undefined): string {
    if (!access) throw new UnauthorizedException("Authentication required.");
    if (!this.canManageBilling(access)) {
      throw new ForbiddenException("Only the workspace owner can manage billing.");
    }
    return requireOrganizationId(access);
  }

  private requirePayWay(): PayWayGateway {
    try {
      if (!this.payway.isConfigured()) {
        throw new PayWayConfigurationError("ABA PayWay is not configured for this environment.");
      }
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : "ABA PayWay configuration failed.");
      throw new ServiceUnavailableException("Card payments are not available right now. Please try again later.");
    }
    return this.payway;
  }

  private database(): BillingDb {
    return this.prisma as unknown as BillingDb;
  }
}

/** One checkout click inside this window reuses the same PayWay transaction. */
const CHECKOUT_REUSE_WINDOW_MS = 15 * 60 * 1000;

type PaidEffect = {
  kind: "apply" | "schedule_plan_change";
  plan: SubscriptionPlanName;
  billingCycle: BillingCycleName;
  periodStart: Date;
  periodEnd: Date;
};

/**
 * What one verified payment buys, given the subscription's state at verification
 * time:
 * - no subscription, or the period already ended → the paid cycle starts now;
 * - still inside a period, same plan/cycle → the paid cycle is appended after it;
 * - still inside a period, different plan/cycle → the paid cycle replaces the
 *   plan when that period ends (never mid-period, never prorated).
 */
export function decidePurpose(
  subscription: Subscription | null,
  plan: SubscriptionPlanName,
  billingCycle: BillingCycleName,
  now: Date,
): "NEW_SUBSCRIPTION" | "RENEWAL" | "PLAN_CHANGE" {
  if (!subscription) return "NEW_SUBSCRIPTION";
  if (subscription.currentPeriodEnd <= now) return "RENEWAL";
  return subscription.plan === plan && subscription.billingCycle === billingCycle ? "RENEWAL" : "PLAN_CHANGE";
}

export function resolvePaidEffect(
  subscription: Subscription | null,
  attempt: Pick<PaymentAttempt, "plan" | "billingCycle">,
  verifiedAt: Date,
): PaidEffect {
  const plan = attempt.plan as SubscriptionPlanName;
  const billingCycle = attempt.billingCycle as BillingCycleName;

  const rank = { PLUS: 0, PRO: 1, BUSINESS: 2 };
  if (subscription && subscription.currentPeriodEnd > verifiedAt && rank[plan] > rank[subscription.plan]) {
    return { kind: "apply", plan, billingCycle, periodStart: verifiedAt,
      periodEnd: addBillingCycle(verifiedAt, billingCycle) };
  }

  if (subscription && subscription.currentPeriodEnd > verifiedAt && decidePurpose(subscription, plan, billingCycle, verifiedAt) === "PLAN_CHANGE") {
    return {
      kind: "schedule_plan_change",
      plan,
      billingCycle,
      periodStart: subscription.currentPeriodEnd,
      periodEnd: addBillingCycle(subscription.currentPeriodEnd, billingCycle),
    };
  }

  // Later of the two, so a late renewal does not silently backdate access.
  const periodStart = subscription && subscription.currentPeriodEnd > verifiedAt ? subscription.currentPeriodEnd : verifiedAt;
  return { kind: "apply", plan, billingCycle, periodStart, periodEnd: addBillingCycle(periodStart, billingCycle) };
}

export function serializeSubscription(subscription: Subscription) {
  return {
    plan: subscription.plan,
    status: subscription.status,
    billingCycle: subscription.billingCycle,
    renewalMode: subscription.renewalMode,
    currentPeriodStart: subscription.currentPeriodStart.toISOString(),
    currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    pendingPlan: subscription.pendingPlan ?? null,
    pendingBillingCycle: subscription.pendingBillingCycle ?? null,
    createdAt: subscription.createdAt.toISOString(),
    updatedAt: subscription.updatedAt.toISOString(),
  };
}

export function serializeAttempt(attempt: PaymentAttempt) {
  return {
    tranId: attempt.tranId,
    status: attempt.status,
    plan: attempt.plan,
    billingCycle: attempt.billingCycle,
    purpose: attempt.purpose,
    amountMinor: attempt.amountMinor,
    amountDisplay: formatAmount(attempt.amountMinor),
    currency: attempt.currency,
    providerReference: attempt.providerReference,
    failureReason: attempt.failureReason,
    verifiedAt: attempt.verifiedAt?.toISOString() ?? null,
    periodStart: attempt.periodStart?.toISOString() ?? null,
    periodEnd: attempt.periodEnd?.toISOString() ?? null,
    createdAt: attempt.createdAt.toISOString(),
  };
}

/** PayWay caps `tran_id` at 20 characters; this is 19 and alphanumeric. */
function createTranId(): string {
  return `EVL${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString("hex").toUpperCase()}`;
}

function readTranId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>).tran_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isIdempotencyKeyCollision(error: unknown): boolean {
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate?.code !== "P2002") return false;
  const target = candidate.meta?.target;
  const names = Array.isArray(target) ? target.map(String) : typeof target === "string" ? [target] : [];
  return names.some((name) => name === "idempotencyKey" || name === "idempotency_key");
}
