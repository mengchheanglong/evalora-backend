import type { RateLimitResult } from "./rate-limit.types";

export interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number, customNow?: number): RateLimitResult;
  reset(key: string): void;
  clear(): void;
  size(): number;
}

/**
 * In-memory sliding-window rate limit store.
 * Tracks timestamps of recent hits within a rolling window [now - windowMs, now]
 * to prevent burst attacks at fixed-window boundaries and ensure strict, smooth rate limiting.
 */
export class SlidingWindowRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, number[]>();
  private lastSweep = Date.now();

  consume(key: string, limit: number, windowMs: number, customNow?: number): RateLimitResult {
    const now = customNow ?? Date.now();
    this.sweep(now, windowMs);

    const windowStart = now - windowMs;
    const existing = this.buckets.get(key) ?? [];

    // Binary search or sequential scan to find the first timestamp within the sliding window
    let validStartIdx = 0;
    while (validStartIdx < existing.length && existing[validStartIdx] <= windowStart) {
      validStartIdx++;
    }

    const currentTimestamps = validStartIdx > 0 ? existing.slice(validStartIdx) : existing;

    if (currentTimestamps.length >= limit) {
      // The oldest recorded hit determines when the next request slot becomes available
      const oldestTimestamp = currentTimestamps[0];
      const resetAt = oldestTimestamp + windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
      this.buckets.set(key, currentTimestamps);

      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt,
        retryAfterSeconds,
      };
    }

    currentTimestamps.push(now);
    this.buckets.set(key, currentTimestamps);

    const oldestTimestamp = currentTimestamps[0];
    const resetAt = oldestTimestamp + windowMs;

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - currentTimestamps.length),
      resetAt,
      retryAfterSeconds: 0,
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  clear(): void {
    this.buckets.clear();
  }

  size(): number {
    return this.buckets.size;
  }

  private sweep(now: number, windowMs: number): void {
    // Reclaim memory at most once per window interval
    if (now - this.lastSweep < windowMs) {
      return;
    }

    this.lastSweep = now;
    const windowStart = now - windowMs;
    for (const [key, timestamps] of this.buckets) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= windowStart) {
        this.buckets.delete(key);
      }
    }
  }
}

/**
 * Backward-compatible alias so existing InMemoryRateLimitStore instantiations
 * automatically leverage the superior sliding-window rate limit store.
 */
export class InMemoryRateLimitStore extends SlidingWindowRateLimitStore {}
