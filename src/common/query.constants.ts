/**
 * Upper bound applied to otherwise-unbounded list reads so a single query can
 * never scan an entire table (latency + memory + DB egress) as a workspace
 * grows. When a list routinely approaches this, introduce real cursor pagination
 * rather than raising the cap indefinitely.
 */
export const DEFAULT_LIST_LIMIT = 500;
