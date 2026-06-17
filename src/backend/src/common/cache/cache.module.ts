import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { CacheService } from './cache.service';

/**
 * CacheModule — provides CacheService (cache-aside, Redis-backed).
 *
 * RedisModule là @Global nên không cần import riêng,
 * nhưng ta import tường minh để dependency rõ ràng.
 *
 * Export CacheService để các feature module (concerts, orders...) dùng.
 */
@Module({
  imports: [RedisModule],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
