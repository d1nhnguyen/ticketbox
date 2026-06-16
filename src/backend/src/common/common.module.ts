import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './redis/redis.module';
import { RateLimitService } from './redis/rate-limit.service';
import { RateLimitGuard } from './guards/rate-limit.guard';

/**
 * CommonModule: provides shared infrastructure across all feature modules.
 * - RedisModule (global): ioredis client
 * - RateLimitService: Token Bucket logic
 * - RateLimitGuard: applied globally as APP_GUARD
 */
@Module({
  imports: [ConfigModule, RedisModule],
  providers: [
    RateLimitService,
    {
      // Register as a global guard — applies to every route automatically
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
  exports: [RateLimitService, RedisModule],
})
export class CommonModule {}
