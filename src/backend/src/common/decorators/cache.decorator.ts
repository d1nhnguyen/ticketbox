import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key cho cache interceptor (dùng trong tương lai nếu cần cache tự động).
 * Hiện tại ConcertsService dùng cache-aside thủ công — decorator này để mở rộng sau.
 */
export const CACHE_KEY = 'cacheKey';
export const CACHE_TTL = 'cacheTtl';

/**
 * @UseCache(key, ttl) — đánh dấu một handler sẽ được cache.
 * Dùng kết hợp với CacheInterceptor (nếu triển khai sau).
 *
 * @example
 * @UseCache('concert:list', 120)
 * @Get()
 * findAll() {}
 */
export const UseCache = (key: string, ttlSeconds: number) =>
  SetMetadata(CACHE_KEY, { key, ttlSeconds });

/**
 * @InvalidateCache(pattern) — đánh dấu một handler sẽ xóa cache theo pattern.
 * Dùng kết hợp với CacheInvalidationInterceptor (nếu triển khai sau).
 *
 * @example
 * @InvalidateCache('cache:concert:*')
 * @Post()
 * create(@Body() dto: CreateConcertDto) {}
 */
export const InvalidateCache = (pattern: string) =>
  SetMetadata('cacheInvalidatePattern', pattern);
