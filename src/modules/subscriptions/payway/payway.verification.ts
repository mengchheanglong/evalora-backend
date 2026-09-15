import { PAYWAY_STATUS_CODES, type PaymentOutcome, type PayWayTransactionVerification } from "./payway.types";

/**
 * Pure interpretation of a PayWay transaction. Kept separate from the HTTP
 * client so activation rules can be tested without a network or a database.
 */

export function interpretPaymentOutcome(verification: PayWayTransactionVerification): PaymentOutcome {
  if (verification.providerStatusCode !== null) {
    switch (verification.providerStatusCode) {
      case PAYWAY_STATUS_CODES.APPROVED:
        return "APPROVED";
      case PAYWAY_STATUS_CODES.PENDING:
        return "PENDING";
      case PAYWAY_STATUS_CODES.DECLINED:
        return "DECLINED";
      case PAYWAY_STATUS_CODES.REFUNDED:
        return "REFUNDED";
      case PAYWAY_STATUS_CODES.CANCELLED:
        return "CANCELLED";
      default:
        return "UNKNOWN";
    }
  }

  const label = verification.providerStatus?.trim().toUpperCase();
  if (!label) return "UNKNOWN";
  if (label === "APPROVED" || label === "PRE-AUTH") return "APPROVED";
  if (label === "PENDING") return "PENDING";
  if (label === "DECLINED") return "DECLINED";
  if (label === "REFUNDED") return "REFUNDED";
  if (label === "CANCELLED") return "CANCELLED";
  return "UNKNOWN";
}

/**
 * The transaction must match the catalog price we asked for, in the currency we
 * asked for. A missing amount or currency is a mismatch: an unverifiable
 * transaction must never activate a subscription.
 */
export function compareTransactionToExpectation(
  verification: PayWayTransactionVerification,
  expected: { amountMinor: number; currency: string },
): { amountMatches: boolean; currencyMatches: boolean } {
  const reportedMinor = verification.amountMinor;
  return {
    amountMatches: reportedMinor !== null && reportedMinor === expected.amountMinor,
    currencyMatches: verification.currency?.trim().toUpperCase() === expected.currency.trim().toUpperCase(),
  };
}

/** Human-readable failure reason stored on the attempt; never includes provider secrets. */
export function describeRejection(
  outcome: PaymentOutcome,
  expected: { amountMinor: number; currency: string },
  verification: PayWayTransactionVerification,
): string {
  if (outcome !== "APPROVED") return `PayWay reported ${outcome.toLowerCase()}.`;
  const { amountMatches, currencyMatches } = compareTransactionToExpectation(verification, expected);
  if (!amountMatches) {
    return `Paid amount did not match the catalog price (${verification.amountSource ?? "amount"} was not the expected value).`;
  }
  if (!currencyMatches) return "Paid currency did not match the expected currency.";
  return "Payment could not be verified.";
}
