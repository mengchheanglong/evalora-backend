import type { RateLimitResult } from "./rate-limit.types";

export interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number, customNow?: number): RateLimitResult;
  reset(key: string): void;
  clear(): void;
  size(): number;
}

const DEFAULT_WINDOW_MS = 60_000;
const MAX_STORE_BUCKETS = 10_000;

/**
 * In-memory sliding-window rate limit store.
 * Tracks timestamps of recent hits within a rolling window [now - windowMs, now]
 * to prevent burst attacks at fixed-window boundaries and ensure strict, smooth rate limiting.
 *
 * Includes protections for:
 * - Clock skew / backwards NTP adjustments
 * - Zero or negative limits/windows
 * - High-water mark memory eviction under large-scale IP flooding
 */
export class SlidingWindowRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, number[]>();
  private lastSweep = Date.now();

  consume(key: string, limit: number, windowMs: number, customNow?: number): RateLimitResult {
    const now = customNow ?? Date.now();
    const effectiveWindowMs = windowMs > 0 ? windowMs : DEFAULT_WINDOW_MS;
    const effectiveLimit = Math.max(1, limit);

    this.sweep(now, effectiveWindowMs);

    const windowStart = now - effectiveWindowMs;
    const existing = this.buckets.get(key) ?? [];

    // Filter out:
    // 1. Timestamps older than the sliding window start
    // 2. Future timestamps beyond reasonable tolerance (clock skew guard)
    const validTimestamps = existing.filter((t) => t > windowStart && t <= now + 1000);

    if (validTimestamps.length >= effectiveLimit) {
      // The oldest recorded hit determines when the next request slot becomes available
      const oldestTimestamp = validTimestamps[0];
      const resetAt = oldestTimestamp + effectiveWindowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
      this.buckets.set(key, validTimestamps);

      return {
        allowed: false,
        limit: effectiveLimit,
        remaining: 0,
        resetAt,
        retryAfterSeconds,
      };
    }

    validTimestamps.push(now);
    this.buckets.set(key, validTimestamps);

    const oldestTimestamp = validTimestamps[0];
    const resetAt = oldestTimestamp + effectiveWindowMs;

    return {
      allowed: true,
      limit: effectiveLimit,
      remaining: Math.max(0, effectiveLimit - validTimestamps.length),
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
    // Reclaim memory if window elapsed OR if map exceeds high-water mark
    const shouldSweep = (now - this.lastSweep >= windowMs) || (this.buckets.size >= MAX_STORE_BUCKETS);
    if (!shouldSweep) {
      return;
    }

    this.lastSweep = now;
    const windowStart = now - windowMs;
    for (const [key, timestamps] of this.buckets) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= windowStart) {
        this.buckets.delete(key);
      }
    }

    // Emergency high-water eviction: if still exceeding MAX_STORE_BUCKETS, evict oldest 20%
    if (this.buckets.size >= MAX_STORE_BUCKETS) {
      let count = 0;
      const toDelete = Math.floor(MAX_STORE_BUCKETS * 0.2);
      for (const key of this.buckets.keys()) {
        if (count++ >= toDelete) break;
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
