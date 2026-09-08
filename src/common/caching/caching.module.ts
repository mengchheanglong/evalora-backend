import { Global, Module } from "@nestjs/common";
import { CacheService, CACHE_CLIENT_TOKEN } from "./cache.service";
import { InMemoryCacheClient } from "./in-memory-cache.client";

@Global()
@Module({
  providers: [
    {
      provide: CACHE_CLIENT_TOKEN,
      useFactory: () => new InMemoryCacheClient(),
    },
    CacheService,
  ],
  exports: [CacheService, CACHE_CLIENT_TOKEN],
})
export class CachingModule {}
