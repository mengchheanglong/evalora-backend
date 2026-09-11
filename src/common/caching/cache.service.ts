import { Injectable, Inject, Optional } from "@nestjs/common";
import type { CacheClient, CacheSetOptions, CacheStats } from "./cache.types";
import { InMemoryCacheClient } from "./in-memory-cache.client";

export const CACHE_CLIENT_TOKEN = Symbol("CACHE_CLIENT_TOKEN");

/**
 * Application cache service managing application-level caching,
 * stampede-protected data fetching (single-flight), and invalidation.
 */
@Injectable()
export class CacheService {
  private readonly client: CacheClient;
  /** In-flight factory executions to prevent cache stampedes */
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(@Optional() @Inject(CACHE_CLIENT_TOKEN) client?: CacheClient) {
    this.client = client ?? new InMemoryCacheClient();
  }

  /**
   * Retrieves an item from cache. Returns null if missing or expired.
   */
  async get<T>(key: string): Promise<T | null> {
    return this.client.get<T>(key);
  }

  /**
   * Sets an item in cache with specified TTL in seconds.
   */
  async set<T>(key: string, value: T, options?: CacheSetOptions | number): Promise<void> {
    return this.client.set<T>(key, value, options);
  }

  /**
   * Deletes an item from cache.
   */
  async delete(key: string): Promise<boolean> {
    return this.client.delete(key);
  }

  /**
   * Deletes all items whose keys start with the given prefix.
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    return this.client.deleteByPrefix(prefix);
  }

  /**
   * Deletes all items matching a wildcard pattern (e.g. `evalora:orgs:*:templates`).
   */
  async deleteByPattern(pattern: string): Promise<number> {
    return this.client.deleteByPattern(pattern);
  }

  /**
   * Checks if an unexpired key exists in the cache.
   */
  async has(key: string): Promise<boolean> {
    return this.client.has(key);
  }

  /**
   * Clears all items in the cache.
   */
  async clear(): Promise<void> {
    return this.client.clear();
  }

  /**
   * Retrieves operational cache statistics.
   */
  getStats(): CacheStats {
    return this.client.getStats();
  }

  /**
   * Resets operational statistics counters.
   */
  resetStats(): void {
    this.client.resetStats();
  }

  /**
   * Retrieves a cached value, or executes the factory to compute and store it.
   * Employs single-flight stampede protection: concurrent requests for the same
   * key will await the single active computation rather than triggering multiple queries.
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheSetOptions | number,
  ): Promise<T> {
    // 1. Check existing cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // 2. Coalesce in-flight factory calls for the same key
    const existingPromise = this.inflight.get(key) as Promise<T> | undefined;
    if (existingPromise) {
      return existingPromise;
    }

    // 3. Initiate single-flight computation
    const computation = (async () => {
      try {
        const freshValue = await factory();
        if (freshValue !== undefined && freshValue !== null) {
          await this.set(key, freshValue, options);
        }
        return freshValue;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, computation);
    return computation;
  }
}
