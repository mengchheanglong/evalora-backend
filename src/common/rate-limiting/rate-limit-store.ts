import type { RateLimitRecord, RateLimitResult } from "./rate-limit.types";

export interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number): RateLimitResult;
  reset(key: string): void;
  clear(): void;
  size(): number;
}

/**
 * In-memory fixed-window rate limit store with auto-sweeping of expired records.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, RateLimitRecord>();
  private lastSweep = Date.now();

  consume(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    this.sweep(now, windowMs);

    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - 1),
        resetAt,
        retryAfterSeconds: 0,
      };
    }

    if (existing.count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt: existing.resetAt,
        retryAfterSeconds,
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - existing.count),
      resetAt: existing.resetAt,
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
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
