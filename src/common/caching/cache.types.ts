/**
 * Standard cache namespaces across Evalora domain models.
 */
export enum CacheNamespace {
  CATALOG = "catalog",
  TEMPLATES = "templates",
  SESSIONS = "sessions",
  ORGANIZATIONS = "orgs",
  USERS = "users",
  ANALYTICS = "analytics",
  SYSTEM = "system",
  REPORTS = "reports",
}

/**
 * Internal storage record for a cached entry.
 */
export interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
  createdAt: number;
  hits: number;
}

/**
 * Options when writing to cache.
 */
export interface CacheSetOptions {
  /** Time to live in seconds */
  ttlSeconds?: number;
  /** Optional tags for grouped invalidation */
  tags?: string[];
}

/**
 * Operational cache statistics for observability and monitoring.
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  size: number;
  hitRatio: number;
}

/**
 * Pluggable cache client interface compatible with both in-memory
 * and distributed stores (e.g. Redis).
 */
export interface CacheClient {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: CacheSetOptions | number): Promise<void>;
  delete(key: string): Promise<boolean>;
  deleteByPrefix(prefix: string): Promise<number>;
  deleteByPattern(pattern: string): Promise<number>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
  size(): Promise<number>;
  getStats(): CacheStats;
  resetStats(): void;
}
