import type { PaymentAttempt, Prisma, Subscription } from "@prisma/client";
import { PayWayClient } from "../../src/modules/subscriptions/payway/payway.client";
import type { PayWayConfig, PayWayGateway } from "../../src/modules/subscriptions/payway/payway.types";
import type { PrismaService } from "../../src/prisma/prisma.service";

/**
 * In-memory stand-in for the billing slice of Prisma. It enforces the two
 * unique constraints the real schema has (tran_id, idempotency_key) and the
 * conditions the service's compare-and-swap updates rely on, so idempotency and
 * concurrency behavior is exercised rather than assumed.
 */
export class BillingFake {
  readonly subscriptions: Subscription[] = [];
  readonly attempts: PaymentAttempt[] = [];
  now = new Date("2026-09-13T00:00:00.000Z");

  private sequence = 0;

  readonly client = {
    subscription: {
      findUnique: async ({ where }: { where: { organizationId: string } }) => this.subscription(where.organizationId),
      create: async ({ data }: { data: Prisma.SubscriptionUncheckedCreateInput }) => {
        const row: Subscription = {
          id: data.id ?? `sub-${++this.sequence}`,
          organizationId: data.organizationId,
          plan: data.plan,
          status: data.status,
          billingCycle: data.billingCycle,
          renewalMode: data.renewalMode ?? "MANUAL",
          currentPeriodStart: toDate(data.currentPeriodStart)!,
          currentPeriodEnd: toDate(data.currentPeriodEnd)!,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
          pendingPlan: data.pendingPlan ?? null,
          pendingBillingCycle: data.pendingBillingCycle ?? null,
          providerCustomerId: data.providerCustomerId ?? null,
          providerSubscriptionId: data.providerSubscriptionId ?? null,
          createdAt: this.now,
          updatedAt: this.now,
        };
        this.subscriptions.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: { id: string }; data: Prisma.SubscriptionUncheckedUpdateInput }) => {
        const row = this.subscriptions.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error("Subscription not found.");
        Object.assign(row, stripUndefined(data), { updatedAt: this.now });
        return { ...row };
      },
      updateMany: async ({ where, data }: { where: Prisma.SubscriptionWhereInput; data: Prisma.SubscriptionUncheckedUpdateManyInput }) => {
        const matched = this.subscriptions.filter((row) => matches(row, where));
        for (const row of matched) Object.assign(row, stripUndefined(data), { updatedAt: this.now });
        return { count: matched.length };
      },
    },
    paymentAttempt: {
      findUnique: async ({ where }: { where: { tranId: string } | { id: string } }) =>
        "tranId" in where
          ? (this.attempts.find((row) => row.tranId === where.tranId) ?? null)
          : (this.attempts.find((row) => row.id === where.id) ?? null),
      findFirst: async ({ where }: { where: Prisma.PaymentAttemptWhereInput }) => this.attempts.find((row) => matches(row, where)) ?? null,
      create: async ({ data }: { data: Prisma.PaymentAttemptUncheckedCreateInput }) => {
        if (this.attempts.some((row) => row.tranId === data.tranId)) throw uniqueViolation("tranId");
        if (this.attempts.some((row) => row.idempotencyKey === data.idempotencyKey)) throw uniqueViolation("idempotencyKey");
        const row: PaymentAttempt = {
          id: `attempt-${++this.sequence}`,
          organizationId: data.organizationId,
          subscriptionId: data.subscriptionId ?? null,
          tranId: data.tranId,
          idempotencyKey: data.idempotencyKey,
          plan: data.plan,
          billingCycle: data.billingCycle,
          purpose: data.purpose,
          amountMinor: data.amountMinor,
          currency: data.currency,
          status: data.status,
          providerReference: data.providerReference ?? null,
          providerStatus: data.providerStatus ?? null,
          failureReason: data.failureReason ?? null,
          verifiedAt: toDate(data.verifiedAt),
          periodStart: toDate(data.periodStart),
          periodEnd: toDate(data.periodEnd),
          createdAt: this.now,
          updatedAt: this.now,
        };
        this.attempts.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: { id: string }; data: Prisma.PaymentAttemptUncheckedUpdateInput }) => {
        const row = this.attempts.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error("Payment attempt not found.");
        Object.assign(row, stripUndefined(data), { updatedAt: this.now });
        return { ...row };
      },
      updateMany: async ({ where, data }: { where: Prisma.PaymentAttemptWhereInput; data: Prisma.PaymentAttemptUncheckedUpdateManyInput }) => {
        const matched = this.attempts.filter((row) => matches(row, where));
        for (const row of matched) Object.assign(row, stripUndefined(data), { updatedAt: this.now });
        return { count: matched.length };
      },
    },
    $transaction: async <T>(operation: (transaction: unknown) => Promise<T>): Promise<T> => operation(this.client),
  };

  asPrismaService(): PrismaService {
    return this.client as unknown as PrismaService;
  }

  /** Clears stored rows so one instance can serve a whole spec file. */
  reset(): void {
    this.subscriptions.length = 0;
    this.attempts.length = 0;
    this.sequence = 0;
    this.now = new Date("2026-09-13T00:00:00.000Z");
  }

  seedSubscription(overrides: Partial<Subscription> = {}): Subscription {
    const row: Subscription = {
      id: "sub-1",
      organizationId: "org-a",
      plan: "PRO",
      status: "ACTIVE",
      billingCycle: "MONTHLY",
      renewalMode: "MANUAL",
      currentPeriodStart: new Date("2026-09-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      pendingPlan: null,
      pendingBillingCycle: null,
      providerCustomerId: null,
      providerSubscriptionId: null,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      ...overrides,
    };
    this.subscriptions.push(row);
    return row;
  }

  subscription(organizationId: string): Subscription | null {
    return this.subscriptions.find((row) => row.organizationId === organizationId) ?? null;
  }

  attempt(tranId: string): PaymentAttempt | null {
    return this.attempts.find((row) => row.tranId === tranId) ?? null;
  }

  /** Advances the injected clock used by the service under test. */
  setNow(iso: string): void {
    this.now = new Date(iso);
  }
}

export const TEST_PAYWAY_CONFIG: PayWayConfig = {
  environment: "sandbox",
  baseUrl: "https://checkout-sandbox.payway.com.kh",
  merchantId: "ec000002",
  apiKey: "sandbox-test-hash-key",
  paymentCallbackUrl: "https://api.evalora.invalid/api/subscriptions/payway/callback",
  returnUrlEncoding: "base64",
  requestTimeoutMs: 1_000,
  appUrl: "https://app.evalora.invalid",
};

export interface PayWayTestHarness {
  gateway: PayWayGateway;
  /** Every Check Transaction request the adapter sent, parsed. */
  checkRequests: Array<Record<string, unknown>>;
  respond(tranId: string, body: unknown | null): void;
  failWith(status: number): void;
  reset(): void;
}

/**
 * A real PayWayClient with stubbed transport: signing, hashing and response
 * parsing are the production code paths, only the network is replaced.
 */
export function createPayWayHarness(config: PayWayConfig = TEST_PAYWAY_CONFIG): PayWayTestHarness {
  const responses = new Map<string, unknown | null>();
  const checkRequests: Array<Record<string, unknown>> = [];
  let forcedFailure: number | null = null;

  const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const tranId = String(body.tran_id ?? "");
    checkRequests.push(body);
    if (forcedFailure !== null) {
      return new Response("{}", { status: forcedFailure, headers: { "content-type": "application/json" } });
    }
    const canned = responses.has(tranId) ? responses.get(tranId) : null;
    if (!canned) {
      return jsonResponse({ status: { code: "6", message: "Transaction not found", tran_id: tranId } });
    }
    return jsonResponse(canned);
  }) as unknown as typeof fetch;

  return {
    gateway: new PayWayClient(() => config, fetchImpl),
    checkRequests,
    respond(tranId, body) {
      responses.set(tranId, body);
    },
    failWith(status) {
      forcedFailure = status;
    },
    reset() {
      responses.clear();
      checkRequests.length = 0;
      forcedFailure = null;
    },
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

/** Approved Check Transaction payload, shaped like the documented response. */
export function approvedPayment(tranId: string, options: { amount?: number; currency?: string; apv?: string } = {}) {
  const amount = options.amount ?? 79;
  return {
    status: { code: "00", message: "Success!", tran_id: tranId },
    data: {
      payment_status_code: 0,
      payment_status: "APPROVED",
      total_amount: amount,
      original_amount: amount,
      payment_amount: amount,
      payment_currency: options.currency ?? "USD",
      apv: options.apv ?? "832865",
      transaction_date: "2026-09-13T00:00:00Z",
    },
  };
}

export function declinedPayment(tranId: string) {
  return {
    status: { code: "00", message: "Success!", tran_id: tranId },
    data: { payment_status_code: 3, payment_status: "DECLINED", total_amount: 79, payment_currency: "USD" },
  };
}

export function pendingPayment(tranId: string) {
  return {
    status: { code: "00", message: "Success!", tran_id: tranId },
    data: { payment_status_code: 2, payment_status: "PENDING", total_amount: 79, payment_currency: "USD" },
  };
}

function uniqueViolation(field: "tranId" | "idempotencyKey") {
  return Object.assign(new Error(`Unique constraint failed on ${field}`), {
    code: "P2002",
    meta: { target: [field] },
  });
}

function stripUndefined(input: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

/** Prisma accepts ISO strings wherever it accepts a Date; the rows store Date. */
function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(value);
}

/**
 * Minimal Prisma `where` matcher: scalar equality plus `{ gte }`/`{ gt }`/`{ lte }`/`{ lt }`
 * on dates, which is the whole surface the billing queries use.
 */
function matches(row: object, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = (row as Record<string, unknown>)[key];
    if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime();
    if (condition && typeof condition === "object") {
      const bounds = condition as Record<string, Date>;
      if (bounds.gte && (!(value instanceof Date) || value.getTime() < bounds.gte.getTime())) return false;
      if (bounds.gt && (!(value instanceof Date) || value.getTime() <= bounds.gt.getTime())) return false;
      if (bounds.lte && (!(value instanceof Date) || value.getTime() > bounds.lte.getTime())) return false;
      if (bounds.lt && (!(value instanceof Date) || value.getTime() >= bounds.lt.getTime())) return false;
      return true;
    }
    return value === condition;
  });
}
