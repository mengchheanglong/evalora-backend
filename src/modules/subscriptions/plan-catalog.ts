/**
 * Authoritative billing catalog.
 *
 * The backend — never the browser — owns price. `POST /api/subscriptions/checkout`
 * accepts only a plan name and a billing cycle, and this module turns those two
 * values into the amount that PayWay is asked to collect. Annual is a prepaid
 * year, not a discounted monthly subscription, so it has its own price instead
 * of a per-month figure with a discount factor.
 *
 * All amounts are integer minor units (USD cents). Nothing here is ever derived
 * from a request body.
 */

export const BILLING_CURRENCY = "USD";

export const SUBSCRIPTION_PLANS = ["PLUS", "PRO", "BUSINESS"] as const;
export type SubscriptionPlanName = (typeof SUBSCRIPTION_PLANS)[number];

export const BILLING_CYCLES = ["MONTHLY", "ANNUAL"] as const;
export type BillingCycleName = (typeof BILLING_CYCLES)[number];

/** Monthly: 29 / 79 / 199 USD. Annual: 276 / 756 / 1908 USD. */
const PRICE_CATALOG: Record<SubscriptionPlanName, Record<BillingCycleName, number>> = {
  PLUS: { MONTHLY: 2_900, ANNUAL: 27_600 },
  PRO: { MONTHLY: 7_900, ANNUAL: 75_600 },
  BUSINESS: { MONTHLY: 19_900, ANNUAL: 190_800 },
};

export function isSubscriptionPlan(value: unknown): value is SubscriptionPlanName {
  return typeof value === "string" && (SUBSCRIPTION_PLANS as readonly string[]).includes(value);
}

export function isBillingCycle(value: unknown): value is BillingCycleName {
  return typeof value === "string" && (BILLING_CYCLES as readonly string[]).includes(value);
}

/** Authoritative amount in USD cents for one billing cycle. */
export function planPrice(plan: SubscriptionPlanName, billingCycle: BillingCycleName): number {
  return PRICE_CATALOG[plan][billingCycle];
}

/** PayWay amount strings are fixed to two decimals; see payway.signature.ts. */
export const AMOUNT_DECIMALS = 2;

export function formatAmount(amountMinor: number): string {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("Billing amounts must be positive integer minor units.");
  }
  return (amountMinor / 100).toFixed(AMOUNT_DECIMALS);
}

/** Whole USD amount PayWay reports back, converted to minor units. */
export function toMinorUnits(amount: number | string): number | null {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function cycleLabel(billingCycle: BillingCycleName): string {
  return billingCycle === "MONTHLY" ? "1 month" : "1 year";
}

/**
 * Adds exactly one billing cycle using calendar arithmetic in UTC: one month
 * means the same day next month, one year means the same day next year. Days
 * that do not exist in the target month clamp to that month's last day
 * (31 Jan + 1 month = 28/29 Feb), which is what a prepaid period must do rather
 * than silently sliding into the following month.
 */
export function addBillingCycle(from: Date, billingCycle: BillingCycleName): Date {
  const result = new Date(from.getTime());
  const day = result.getUTCDate();
  // Move to day 1 first so a month/year rollover cannot overflow the target.
  result.setUTCDate(1);
  if (billingCycle === "MONTHLY") {
    result.setUTCMonth(result.getUTCMonth() + 1);
  } else {
    result.setUTCFullYear(result.getUTCFullYear() + 1);
  }
  const lastDayOfTarget = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDayOfTarget));
  return result;
}
