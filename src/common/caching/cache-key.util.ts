import { CacheNamespace } from "./cache.types";

export const CACHE_ROOT_PREFIX = "evalora";

/**
 * Normalizes a cache key segment:
 * - Trims whitespace
 * - Replaces multiple spaces or colons with single hyphens
 * - Rejects empty/undefined segments
 */
export function sanitizeKeySegment(segment: string | number | undefined | null): string {
  if (segment === undefined || segment === null) {
    return "";
  }

  const str = String(segment).trim();
  if (!str) {
    return "";
  }

  // Replace internal colons and spaces to avoid corrupting the hierarchical key structure
  return str.replace(/[:\s]+/g, "-");
}

/**
 * Builds a predictable, hierarchical cache key adhering to the convention:
 * `evalora:<namespace>:<segment1>:<segment2>:...`
 *
 * Example: `buildCacheKey(CacheNamespace.TEMPLATES, "catalog", "software-engineer")`
 * Result: `evalora:templates:catalog:software-engineer`
 */
export function buildCacheKey(
  namespace: CacheNamespace | string,
  ...segments: Array<string | number | undefined | null>
): string {
  const cleanNamespace = String(namespace).trim().toLowerCase();
  const validSegments = segments
    .map(sanitizeKeySegment)
    .filter((s) => s.length > 0);

  if (validSegments.length === 0) {
    return `${CACHE_ROOT_PREFIX}:${cleanNamespace}`;
  }

  return `${CACHE_ROOT_PREFIX}:${cleanNamespace}:${validSegments.join(":")}`;
}

/**
 * Curated, predictable cache key builders across Evalora's core domains.
 * Enforces consistency and prevents accidental key collisions across modules.
 */
export const CacheKeys = {
  /** Catalog prebuilt template library */
  catalogTemplates: () => buildCacheKey(CacheNamespace.CATALOG, "templates"),

  /** Single catalog template detail */
  catalogTemplate: (templateId: string) =>
    buildCacheKey(CacheNamespace.CATALOG, "template", templateId),

  /** Active templates belonging to an organization */
  orgTemplates: (orgId: string) =>
    buildCacheKey(CacheNamespace.TEMPLATES, "org", orgId),

  /** Specific template detail */
  template: (templateId: string) =>
    buildCacheKey(CacheNamespace.TEMPLATES, "detail", templateId),

  /** Candidate session access preview (by public access code) */
  sessionAccess: (accessCode: string) =>
    buildCacheKey(CacheNamespace.SESSIONS, "access", accessCode),

  /** Interview session detail */
  session: (sessionId: string) =>
    buildCacheKey(CacheNamespace.SESSIONS, "detail", sessionId),

  /** Candidate responses for a session */
  sessionResponses: (sessionId: string) =>
    buildCacheKey(CacheNamespace.SESSIONS, "responses", sessionId),

  /** User profile and workspace membership */
  user: (userId: string) =>
    buildCacheKey(CacheNamespace.USERS, "profile", userId),

  /** Organization workspace details */
  organization: (orgId: string) =>
    buildCacheKey(CacheNamespace.ORGANIZATIONS, "detail", orgId),

  /** Analytics summary for an organization */
  analyticsSummary: (orgId: string) =>
    buildCacheKey(CacheNamespace.ANALYTICS, "summary", orgId),

  /** Analytics template performance */
  analyticsTemplate: (orgId: string, templateId: string) =>
    buildCacheKey(CacheNamespace.ANALYTICS, "template", orgId, templateId),

  /** Live system health snapshot */
  systemHealth: () =>
    buildCacheKey(CacheNamespace.SYSTEM, "health"),
} as const;
