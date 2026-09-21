import { SetMetadata } from "@nestjs/common";

export const CACHE_INVALIDATION_METADATA = "evalora:cache_invalidation";

export type DynamicCacheKeyResolver = (req: any, res?: any) => string | undefined | null;

export type InvalidationEntityTarget =
  | "templates"
  | "sessions"
  | "organization"
  | "reports"
  | "systemHealth"
  | "analytics";

export interface DynamicEntityResolverResult {
  entity: InvalidationEntityTarget;
  id?: string;
  orgId?: string;
  accessCode?: string;
}

export type DynamicEntityResolver = (req: any, res?: any) => DynamicEntityResolverResult | undefined | null;

export interface InvalidateCacheOptions {
  /** Specific cache key or keys to evict */
  keys?: Array<string | DynamicCacheKeyResolver>;
  /** Key prefix or prefixes to evict */
  prefixes?: Array<string | DynamicCacheKeyResolver>;
  /** Wildcard pattern or patterns to evict */
  patterns?: Array<string | DynamicCacheKeyResolver>;
  /** Domain entities to automatically invalidate using standard conventions */
  entities?: Array<InvalidationEntityTarget | DynamicEntityResolver>;
  /** Only execute invalidation when the response status is 2xx (default: true) */
  onlyOnSuccess?: boolean;
}

/**
 * Decorator to declaratively attach cache invalidation hooks to mutating endpoints.
 * When the endpoint executes successfully (POST, PUT, PATCH, DELETE), the
 * CacheInvalidationInterceptor intercepts the response and purges the specified
 * caches instantly.
 */
export const InvalidateCache = (options: InvalidateCacheOptions) =>
  SetMetadata(CACHE_INVALIDATION_METADATA, options);
