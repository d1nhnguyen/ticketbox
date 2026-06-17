import { SetMetadata } from '@nestjs/common';
import {
  SKIP_RATE_LIMIT_KEY,
  RATE_LIMIT_CONFIG_KEY,
  RateLimitOptions,
} from '../guards/rate-limit.guard';

/**
 * Skip global rate limiting for a specific controller or route handler.
 *
 * @example
 * @SkipRateLimit()
 * @Get('health')
 * healthCheck() {}
 */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);

/**
 * Override the default rate limit settings for a specific controller or route handler.
 *
 * @example
 * // Allow only 5 requests/second burst, 1 req/s sustained on login endpoint
 * @RateLimitConfig({ capacity: 5, refillRate: 1, keyStrategy: 'ip' })
 * @Post('login')
 * login() {}
 */
export const RateLimitConfig = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_CONFIG_KEY, options);
