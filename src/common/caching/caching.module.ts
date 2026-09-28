import { Global, Module } from "@nestjs/common";
import { CacheService, CACHE_CLIENT_TOKEN } from "./cache.service";
import { InMemoryCacheClient } from "./in-memory-cache.client";
import { RedisCacheClient } from "./redis-cache.client";
import { CacheInvalidationService } from "./cache-invalidation.service";
import { CacheInvalidationInterceptor } from "./cache-invalidation.interceptor";

@Global()
@Module({
  providers: [
    {
      provide: CACHE_CLIENT_TOKEN,
      useFactory: async () => {
        const redisUrl = process.env.REDIS_URL?.trim();
        const redisHost = process.env.REDIS_HOST?.trim();

        if (redisUrl || redisHost) {
          try {
            const url = redisUrl || `redis://${redisHost}:${process.env.REDIS_PORT || "6379"}`;
            const client = new RedisCacheClient({
              url,
              keyPrefix: process.env.REDIS_PREFIX?.trim() || "evalora:",
              connectTimeout: 3_000,
              maxRetriesPerRequest: 1,
            });
            await client.init();
            console.log(`[Caching] Initialized Redis cache provider at ${url.replace(/:[^:@]+@/, ":***@")}`);
            return client;
          } catch (error) {
            console.warn(
              "[Caching] Failed to connect to Redis, falling back to InMemoryCacheClient:",
              error instanceof Error ? error.message : error,
            );
            return new InMemoryCacheClient();
          }
        }

        return new InMemoryCacheClient();
      },
    },
    CacheService,
    CacheInvalidationService,
    CacheInvalidationInterceptor,
  ],
  exports: [CacheService, CACHE_CLIENT_TOKEN, CacheInvalidationService, CacheInvalidationInterceptor],
})
export class CachingModule {}
