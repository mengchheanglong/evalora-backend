import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";
import { concatMap } from "rxjs/operators";
import {
  CACHE_INVALIDATION_METADATA,
  InvalidateCacheOptions,
  InvalidationEntityTarget,
} from "./cache-invalidation.decorator";
import { CacheInvalidationService } from "./cache-invalidation.service";

/**
 * Interceptor that automatically triggers cache invalidation hooks upon successful
 * completion of mutating operations (POST, PUT, PATCH, DELETE).
 *
 * It inspects `@InvalidateCache` metadata, resolves dynamic parameters from the
 * request and response payloads, and notifies CacheInvalidationService to purge
 * matching keys, prefixes, and domain entity caches.
 */
@Injectable()
export class CacheInvalidationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInvalidationInterceptor.name);

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Optional() @Inject(CacheInvalidationService) private readonly invalidationService?: CacheInvalidationService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();

    // Only process mutating HTTP methods
    const method = (req?.method || "").toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      return next.handle();
    }

    const options = this.reflector.getAllAndOverride<InvalidateCacheOptions>(
      CACHE_INVALIDATION_METADATA,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      concatMap(async (responseBody) => {
        if (this.invalidationService) {
          try {
            await this.processInvalidations(req, responseBody, options);
          } catch (error) {
            this.logger.error(
              `Failed executing automated cache invalidation for ${method} ${req.url}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
        return responseBody;
      }),
    );
  }

  private async processInvalidations(
    req: any,
    resBody: any,
    options?: InvalidateCacheOptions,
  ): Promise<void> {
    if (!this.invalidationService) return;

    // 1. Process explicit keys
    if (options?.keys) {
      for (const keyDef of options.keys) {
        const key = typeof keyDef === "function" ? keyDef(req, resBody) : keyDef;
        if (key) {
          await this.invalidationService.invalidateKey(key);
        }
      }
    }

    // 2. Process explicit prefixes
    if (options?.prefixes) {
      for (const prefixDef of options.prefixes) {
        const prefix = typeof prefixDef === "function" ? prefixDef(req, resBody) : prefixDef;
        if (prefix) {
          await this.invalidationService.invalidateByPrefix(prefix);
        }
      }
    }

    // 3. Process explicit patterns
    if (options?.patterns) {
      for (const patternDef of options.patterns) {
        const pattern = typeof patternDef === "function" ? patternDef(req, resBody) : patternDef;
        if (pattern) {
          await this.invalidationService.invalidateByPattern(pattern);
        }
      }
    }

    // 4. Process domain entity targets
    if (options?.entities) {
      for (const entityDef of options.entities) {
        if (typeof entityDef === "function") {
          const resolved = entityDef(req, resBody);
          if (resolved) {
            await this.invalidateDomainEntity(resolved.entity, resolved.id, resolved.orgId, resolved.accessCode);
          }
        } else {
          await this.inferAndInvalidateEntity(entityDef, req, resBody);
        }
      }
    }
  }

  private async inferAndInvalidateEntity(
    entity: InvalidationEntityTarget,
    req: any,
    resBody: any,
  ): Promise<void> {
    if (!this.invalidationService) return;

    const params = req?.params || {};
    const body = req?.body || {};
    const user = req?.user || {};

    switch (entity) {
      case "templates": {
        const templateId = params.id || params.templateId || resBody?.id || body.templateId;
        const orgId = user.organizationId || body.organizationId || resBody?.organizationId;
        await this.invalidationService.invalidateTemplate(templateId, orgId);
        break;
      }
      case "sessions": {
        const sessionId = params.id || params.sessionId || resBody?.id || resBody?.sessionId || body.sessionId;
        const accessCode = params.accessCode || resBody?.accessCode || body.accessCode;
        const orgId = user.organizationId || resBody?.organizationId;
        await this.invalidationService.invalidateSession(sessionId, accessCode, orgId);
        break;
      }
      case "organization": {
        const orgId = user.organizationId || params.id || params.orgId || resBody?.id;
        if (orgId) {
          await this.invalidationService.invalidateOrganization(orgId);
        }
        break;
      }
      case "reports": {
        const sessionId = params.sessionId || params.id || resBody?.sessionId;
        const orgId = user.organizationId;
        if (sessionId) {
          await this.invalidationService.invalidateReport(sessionId, orgId);
        }
        break;
      }
      case "systemHealth": {
        await this.invalidationService.invalidateSystemHealth();
        break;
      }
      case "analytics": {
        const orgId = user.organizationId || params.orgId;
        if (orgId) {
          await this.invalidationService.invalidateOrganization(orgId);
        }
        break;
      }
    }
  }

  private async invalidateDomainEntity(
    entity: InvalidationEntityTarget,
    id?: string,
    orgId?: string,
    accessCode?: string,
  ): Promise<void> {
    if (!this.invalidationService) return;

    switch (entity) {
      case "templates":
        await this.invalidationService.invalidateTemplate(id, orgId);
        break;
      case "sessions":
        await this.invalidationService.invalidateSession(id, accessCode, orgId);
        break;
      case "organization":
        if (orgId || id) {
          await this.invalidationService.invalidateOrganization((orgId || id)!);
        }
        break;
      case "reports":
        if (id) {
          await this.invalidationService.invalidateReport(id, orgId);
        }
        break;
      case "systemHealth":
        await this.invalidationService.invalidateSystemHealth();
        break;
      case "analytics":
        if (orgId) {
          await this.invalidationService.invalidateOrganization(orgId);
        }
        break;
    }
  }
}
