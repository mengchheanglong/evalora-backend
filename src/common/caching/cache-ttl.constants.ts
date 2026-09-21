/**
 * Standard Time-To-Live (TTL) expiration rules in seconds.
 * Keeps stored responses organized and temporary, preventing stale reads
 * while shielding downstream databases and providers from repetitive queries.
 */
export const CACHE_TTL = {
  /** 5 seconds: for near-realtime signals under high concurrency (e.g. system health snapshots) */
  REALTIME: 5,

  /** 30 seconds: for rapidly changing session access states and polling endpoints */
  SHORT: 30,

  /** 60 seconds (1 minute): for analytics summaries and dashboard metrics */
  MEDIUM: 60,

  /** 300 seconds (5 minutes): standard duration for organization templates and reviewer notes */
  STANDARD: 300,

  /** 1800 seconds (30 minutes): for infrequently changing configuration / user profiles */
  LONG: 1800,

  /** 3600 seconds (1 hour): for prebuilt catalog templates and catalog blueprints */
  CATALOG: 3600,

  /** 86400 seconds (24 hours): static definitions and immutable templates */
  DAY: 86400,
} as const;

/**
 * Domain-specific TTL assignments mapping cache namespaces to appropriate lifetimes.
 */
export const DOMAIN_CACHE_TTL = {
  catalog: CACHE_TTL.CATALOG,
  templates: CACHE_TTL.STANDARD,
  sessions: CACHE_TTL.SHORT,
  orgs: CACHE_TTL.STANDARD,
  users: CACHE_TTL.LONG,
  analytics: CACHE_TTL.MEDIUM,
  system: CACHE_TTL.REALTIME,
} as const;

/** Minimum allowed TTL (1 second) to prevent zero/negative infinite caches */
export const MIN_TTL_SECONDS = 1;

/** Maximum allowed TTL (7 days) to enforce cache freshness and bounded memory */
export const MAX_TTL_SECONDS = 7 * 24 * 3600;

/**
 * Parses and sanitizes a TTL value, ensuring it falls within safe bounds.
 * Falls back safely if the raw value is invalid, non-integer, or non-positive.
 */
export function parseTtlSeconds(raw: unknown, fallback: number = CACHE_TTL.STANDARD): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < MIN_TTL_SECONDS) {
    return fallback;
  }
  return Math.min(parsed, MAX_TTL_SECONDS);
}
