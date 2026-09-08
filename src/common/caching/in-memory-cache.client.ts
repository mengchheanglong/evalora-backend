import type { CacheClient, CacheEntry, CacheSetOptions, CacheStats } from "./cache.types";
import { CACHE_TTL, parseTtlSeconds } from "./cache-ttl.constants";

export const DEFAULT_MAX_CACHE_ENTRIES = 5_000;
export const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

export interface InMemoryCacheOptions {
  maxEntries?: number;
  defaultTtlSeconds?: number;
  cloneOnRead?: boolean;
}

/**
 * High-performance, in-memory caching client with:
 * - Deterministic TTL expiration rules (lazy + active sweeping)
 * - Strict capacity bounds with LRU-style eviction to prevent memory leaks
 * - Prefix and wildcard pattern invalidation
 * - Deep immutability cloning option
 * - Comprehensive operational observability stats
 */
export class InMemoryCacheClient implements CacheClient {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;
  private readonly defaultTtlSeconds: number;
  private readonly cloneOnRead: boolean;

  private hits = 0;
  private misses = 0;
  private sets = 0;
  private deletes = 0;
  private evictions = 0;
  private lastSweep = Date.now();

  constructor(options?: InMemoryCacheOptions) {
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
    this.defaultTtlSeconds = options?.defaultTtlSeconds ?? CACHE_TTL.STANDARD;
    this.cloneOnRead = options?.cloneOnRead ?? true;
  }

  async get<T>(key: string): Promise<T | null> {
    const now = Date.now();
    this.autoSweep(now);

    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    // Lazy expiration check
    if (now >= entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      this.evictions++;
      return null;
    }

    entry.hits++;
    this.hits++;

    // Re-insert to keep Map iteration order aligned with recent access (LRU behavior)
    this.store.delete(key);
    this.store.set(key, entry);

    return this.safeClone(entry.value as T);
  }

  async set<T>(key: string, value: T, options?: CacheSetOptions | number): Promise<void> {
    const now = Date.now();
    this.autoSweep(now);

    const ttlSeconds = typeof options === "number"
      ? parseTtlSeconds(options, this.defaultTtlSeconds)
      : parseTtlSeconds(options?.ttlSeconds, this.defaultTtlSeconds);

    const expiresAt = now + ttlSeconds * 1000;

    // Enforce memory bounds before inserting new key
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      this.evictOldest();
    }

    this.store.set(key, {
      value: this.safeClone(value),
      expiresAt,
      createdAt: now,
      hits: 0,
    });

    this.sets++;
  }

  async delete(key: string): Promise<boolean> {
    const existed = this.store.delete(key);
    if (existed) {
      this.deletes++;
    }
    return existed;
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    this.deletes += count;
    return count;
  }

  async deleteByPattern(pattern: string): Promise<number> {
    const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
    let count = 0;
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
        count++;
      }
    }
    this.deletes += count;
    return count;
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      this.evictions++;
      return false;
    }
    return true;
  }

  async clear(): Promise<void> {
    this.deletes += this.store.size;
    this.store.clear();
  }

  async size(): Promise<number> {
    return this.store.size;
  }

  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRatio = totalRequests > 0 ? Number((this.hits / totalRequests).toFixed(4)) : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      deletes: this.deletes,
      evictions: this.evictions,
      size: this.store.size,
      hitRatio,
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.deletes = 0;
    this.evictions = 0;
  }

  /**
   * Proactively sweeps expired entries across the store.
   */
  sweep(now: number = Date.now()): number {
    let swept = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.expiresAt) {
        this.store.delete(key);
        swept++;
      }
    }
    this.evictions += swept;
    this.lastSweep = now;
    return swept;
  }

  private autoSweep(now: number): void {
    if (now - this.lastSweep >= DEFAULT_SWEEP_INTERVAL_MS) {
      this.sweep(now);
    }
  }

  private evictOldest(): void {
    // 1. Try to reclaim expired items first
    const swept = this.sweep();
    if (swept > 0 && this.store.size < this.maxEntries) {
      return;
    }

    // 2. If still full, evict the oldest inserted key (first entry in Map iterator)
    const oldestKey = this.store.keys().next().value;
    if (oldestKey) {
      this.store.delete(oldestKey);
      this.evictions++;
    }
  }

  private safeClone<T>(val: T): T {
    if (!this.cloneOnRead || val === null || typeof val !== "object") {
      return val;
    }
    try {
      if (typeof structuredClone === "function") {
        return structuredClone(val);
      }
      return JSON.parse(JSON.stringify(val)) as T;
    } catch {
      return val;
    }
  }
}
