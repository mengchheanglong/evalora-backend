import { Global, Module } from "@nestjs/common";
import { CacheService, CACHE_CLIENT_TOKEN } from "./cache.service";
import { InMemoryCacheClient } from "./in-memory-cache.client";
import { CacheInvalidationService } from "./cache-invalidation.service";
import { CacheInvalidationInterceptor } from "./cache-invalidation.interceptor";

@Global()
@Module({
  providers: [
    {
      provide: CACHE_CLIENT_TOKEN,
      useFactory: () => new InMemoryCacheClient(),
    },
    CacheService,
    CacheInvalidationService,
    CacheInvalidationInterceptor,
  ],
  exports: [CacheService, CACHE_CLIENT_TOKEN, CacheInvalidationService, CacheInvalidationInterceptor],
})
export class CachingModule {}
