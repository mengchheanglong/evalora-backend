import Redis, { type RedisOptions } from "ioredis";
import type { CacheClient, CacheSetOptions, CacheStats } from "./cache.types";
import { CACHE_TTL, parseTtlSeconds } from "./cache-ttl.constants";

export interface RedisCacheOptions {
  url?: string;
  defaultTtlSeconds?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
  connectTimeout?: number;
}

/**
 * Enterprise-grade distributed Redis cache client for Evalora.
 * Implements CacheClient with:
 * - SCAN-based non-blocking prefix and pattern invalidation
 * - Resilient connection handling and auto-reconnection
 * - Configurable TTL and key prefixing
 * - Full parity with InMemoryCacheClient
 */
export class RedisCacheClient implements CacheClient {
  private readonly redis: Redis;
  private readonly defaultTtlSeconds: number;
  private hits = 0;
  private misses = 0;
  private sets = 0;
  private deletes = 0;

  constructor(urlOrOptions?: string | RedisCacheOptions) {
    const config: RedisCacheOptions =
      typeof urlOrOptions === "string" ? { url: urlOrOptions } : urlOrOptions ?? {};

    this.defaultTtlSeconds = config.defaultTtlSeconds ?? CACHE_TTL.STANDARD;

    const redisOptions: RedisOptions = {
      maxRetriesPerRequest: config.maxRetriesPerRequest ?? 2,
      connectTimeout: config.connectTimeout ?? 5_000,
      lazyConnect: true,
      enableReadyCheck: true,
      keyPrefix: config.keyPrefix,
      retryStrategy: (times) => {
        if (times > 5) return null; // stop retrying after 5 attempts
        return Math.min(times * 200, 2_000);
      },
    };

    if (config.url) {
      this.redis = new Redis(config.url, redisOptions);
    } else {
      this.redis = new Redis(redisOptions);
    }

    this.redis.on("error", (error) => {
      console.warn(`[RedisCache] Connection warning: ${error.message}`);
    });

    this.redis.on("connect", () => {
      console.log("[RedisCache] Connected successfully to Redis server.");
    });
  }

  async init(): Promise<void> {
    if (this.redis.status === "wait") {
      await this.redis.connect();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null || raw === undefined) {
        this.misses++;
        return null;
      }
      this.hits++;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as unknown as T;
      }
    } catch {
      this.misses++;
      return null;
    }
  }

  async set<T>(key: string, value: T, options?: CacheSetOptions | number): Promise<void> {
    try {
      const ttlSeconds =
        typeof options === "number"
          ? parseTtlSeconds(options, this.defaultTtlSeconds)
          : parseTtlSeconds(options?.ttlSeconds, this.defaultTtlSeconds);

      const payload = typeof value === "string" ? value : JSON.stringify(value);

      if (ttlSeconds > 0) {
        await this.redis.set(key, payload, "EX", ttlSeconds);
      } else {
        await this.redis.set(key, payload);
      }
      this.sets++;
    } catch (error) {
      console.warn(`[RedisCache] Failed to set key "${key}":`, error instanceof Error ? error.message : error);
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.redis.del(key);
      if (result > 0) {
        this.deletes += result;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    return this.deleteByPattern(`${prefix}*`);
  }

  async deleteByPattern(pattern: string): Promise<number> {
    try {
      let cursor = "0";
      let totalDeleted = 0;
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          // If keyPrefix is used, scan returns prefixed keys; strip prefix or delete directly
          const deleted = await this.redis.del(...keys);
          totalDeleted += deleted;
        }
      } while (cursor !== "0");

      this.deletes += totalDeleted;
      return totalDeleted;
    } catch (error) {
      console.warn(`[RedisCache] Failed to delete pattern "${pattern}":`, error instanceof Error ? error.message : error);
      return 0;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const exists = await this.redis.exists(key);
      return exists > 0;
    } catch {
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.redis.flushdb();
    } catch (error) {
      console.warn("[RedisCache] Failed to flushdb:", error instanceof Error ? error.message : error);
    }
  }

  async size(): Promise<number> {
    try {
      return await this.redis.dbsize();
    } catch {
      return 0;
    }
  }

  async keys(pattern = "*"): Promise<string[]> {
    try {
      let cursor = "0";
      const matchedKeys: string[] = [];
      do {
        const [nextCursor, batch] = await this.redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = nextCursor;
        matchedKeys.push(...batch);
      } while (cursor !== "0");
      return matchedKeys;
    } catch {
      return [];
    }
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const hitRatio = total > 0 ? Number((this.hits / total).toFixed(4)) : 0;
    return {
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      deletes: this.deletes,
      evictions: 0,
      size: 0,
      hitRatio,
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.deletes = 0;
  }

  async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  get client(): Redis {
    return this.redis;
  }
}
