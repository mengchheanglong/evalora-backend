import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { CacheKeys, buildCacheKey } from "./cache-key.util";
import { CacheNamespace } from "./cache.types";
import { CacheService } from "./cache.service";

export interface CacheInvalidationEvent {
  entity?: string;
  id?: string;
  orgId?: string;
  keys: string[];
  prefixes: string[];
  patterns: string[];
  timestamp: Date;
}

export type CacheInvalidationHook = (event: CacheInvalidationEvent) => void | Promise<void>;

/**
 * High-level, domain-aware automated cache invalidation service.
 * Coordinates entity eviction across collections, details, dependent analytics,
 * and candidate access signals, keeping all cached layers fresh.
 */
@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);
  private readonly hooks: Set<CacheInvalidationHook> = new Set();

  constructor(@Optional() @Inject(CacheService) private readonly cache?: CacheService) {}

  /**
   * Registers a lifecycle hook invoked whenever cache invalidation executes.
   * Returns an unsubscribe function to remove the hook.
   */
  registerHook(hook: CacheInvalidationHook): () => void {
    this.hooks.add(hook);
    return () => {
      this.hooks.delete(hook);
    };
  }

  /**
   * Removes all registered invalidation hooks (useful for test resets).
   */
  clearHooks(): void {
    this.hooks.clear();
  }

  /**
   * Invalidates caches associated with an assessment template mutation
   * (create, update, delete, clone, duplicate).
   */
  async invalidateTemplate(templateId?: string, orgId?: string): Promise<void> {
    const keys: string[] = [buildCacheKey(CacheNamespace.TEMPLATES, "all")];
    const prefixes: string[] = [];
    const patterns: string[] = [];

    if (templateId) {
      keys.push(CacheKeys.template(templateId));
    }
    if (orgId) {
      keys.push(CacheKeys.orgTemplates(orgId));
      keys.push(CacheKeys.analyticsSummary(orgId));
      if (templateId) {
        keys.push(CacheKeys.analyticsTemplate(orgId, templateId));
      }
    } else {
      // When orgId is not known, evict all org template lists
      prefixes.push(buildCacheKey(CacheNamespace.TEMPLATES, "org"));
    }

    await this.executeEvictions({ keys, prefixes, patterns, entity: "templates", id: templateId, orgId });
  }

  /**
   * Invalidates caches associated with interview session mutations
   * (create, update, start, submit, timeout, delete).
   */
  async invalidateSession(sessionId?: string, accessCode?: string, orgId?: string): Promise<void> {
    const keys: string[] = [CacheKeys.systemHealth()];
    const prefixes: string[] = [];
    const patterns: string[] = [buildCacheKey(CacheNamespace.SYSTEM, "health", "*")];

    if (sessionId) {
      keys.push(CacheKeys.session(sessionId));
      keys.push(CacheKeys.sessionResponses(sessionId));
      keys.push(buildCacheKey(CacheNamespace.REPORTS, "detail", sessionId));
    }
    if (accessCode) {
      const cleanCode = accessCode.trim().toUpperCase();
      keys.push(CacheKeys.sessionAccess(cleanCode));
    } else {
      prefixes.push(buildCacheKey(CacheNamespace.SESSIONS, "access"));
    }
    if (orgId) {
      keys.push(CacheKeys.analyticsSummary(orgId));
    } else {
      prefixes.push(buildCacheKey(CacheNamespace.ANALYTICS, "summary"));
    }

    await this.executeEvictions({ keys, prefixes, patterns, entity: "sessions", id: sessionId, orgId });
  }

  /**
   * Invalidates candidate access cache for a specific access code.
   */
  async invalidateCandidateAccess(accessCode: string): Promise<void> {
    const cleanCode = accessCode.trim().toUpperCase();
    const keys = [CacheKeys.sessionAccess(cleanCode)];
    await this.executeEvictions({ keys, prefixes: [], patterns: [], entity: "sessions", id: cleanCode });
  }

  /**
   * Invalidates caches associated with an organization workspace mutation.
   */
  async invalidateOrganization(orgId: string): Promise<void> {
    const keys = [
      CacheKeys.organization(orgId),
      CacheKeys.orgTemplates(orgId),
      CacheKeys.analyticsSummary(orgId),
    ];
    await this.executeEvictions({ keys, prefixes: [], patterns: [], entity: "organization", orgId });
  }

  /**
   * Invalidates user profile and workspace membership caches.
   */
  async invalidateUser(userId: string): Promise<void> {
    const keys = [CacheKeys.user(userId)];
    await this.executeEvictions({ keys, prefixes: [], patterns: [], entity: "users", id: userId });
  }

  /**
   * Invalidates report and reviewer notes caches.
   */
  async invalidateReport(sessionId: string, orgId?: string): Promise<void> {
    const keys = [buildCacheKey(CacheNamespace.REPORTS, "detail", sessionId)];
    if (orgId) {
      keys.push(CacheKeys.analyticsSummary(orgId));
    }
    await this.executeEvictions({ keys, prefixes: [], patterns: [], entity: "reports", id: sessionId, orgId });
  }

  /**
   * Invalidates live system health snapshots across all scopes.
   */
  async invalidateSystemHealth(): Promise<void> {
    const keys = [CacheKeys.systemHealth()];
    const patterns = [buildCacheKey(CacheNamespace.SYSTEM, "health", "*")];
    await this.executeEvictions({ keys, prefixes: [], patterns, entity: "systemHealth" });
  }

  /**
   * Invalidates a single explicit cache key.
   */
  async invalidateKey(key: string): Promise<boolean> {
    if (!this.cache) return false;
    return this.cache.delete(key);
  }

  /**
   * Invalidates all keys starting with the specified prefix.
   */
  async invalidateByPrefix(prefix: string): Promise<number> {
    if (!this.cache) return 0;
    return this.cache.deleteByPrefix(prefix);
  }

  /**
   * Invalidates all keys matching a wildcard pattern.
   */
  async invalidateByPattern(pattern: string): Promise<number> {
    if (!this.cache) return 0;
    return this.cache.deleteByPattern(pattern);
  }

  /**
   * Internal executor that safely evicts keys, prefixes, patterns, and triggers hooks.
   */
  private async executeEvictions(event: {
    keys: string[];
    prefixes: string[];
    patterns: string[];
    entity?: string;
    id?: string;
    orgId?: string;
  }): Promise<void> {
    if (!this.cache) return;

    try {
      // 1. Evict direct keys
      for (const key of event.keys) {
        await this.cache.delete(key);
      }

      // 2. Evict prefixes
      for (const prefix of event.prefixes) {
        await this.cache.deleteByPrefix(prefix);
      }

      // 3. Evict patterns
      for (const pattern of event.patterns) {
        await this.cache.deleteByPattern(pattern);
      }

      // 4. Notify registered lifecycle hooks
      const payload: CacheInvalidationEvent = {
        ...event,
        timestamp: new Date(),
      };

      for (const hook of this.hooks) {
        try {
          await hook(payload);
        } catch (hookError) {
          this.logger.warn(`Cache invalidation hook threw an error: ${hookError}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error executing cache invalidation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
