import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * CacheService — Cache-aside pattern backed by Redis.
 *
 * Key naming convention:
 *   cache:concert:list               → danh sách concerts (TTL dài)
 *   cache:concert:detail:<slug>      → chi tiết concert + ticketTypes (TTL trung bình)
 *   cache:concert:remaining:<id>     → remainingQty per ticketType (TTL ngắn)
 *
 * Invalidation strategy:
 *   - Khi có order thành công → xóa cache:concert:detail:<slug> và cache:concert:list
 *     để remaining không bị stale quá lâu.
 *   - Admin cập nhật concert → xóa tất cả cache liên quan.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  // TTL defaults (seconds) — overridable per call
  static readonly TTL_CONCERT_LIST = 120;   // 2 phút
  static readonly TTL_CONCERT_DETAIL = 60;  // 1 phút (chứa remaining, nên ngắn hơn)

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // ---------------------------------------------------------------------------
  // Core primitives
  // ---------------------------------------------------------------------------

  /**
   * Lấy giá trị đã cache. Trả về null nếu miss.
   */
  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (raw === null) {
      this.logger.debug(`[Cache] MISS  ${key}`);
      return null;
    }
    this.logger.debug(`[Cache] HIT   ${key}`);
    return JSON.parse(raw) as T;
  }

  /**
   * Lưu giá trị vào cache với TTL (giây).
   */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    this.logger.debug(`[Cache] SET   ${key} (TTL=${ttlSeconds}s)`);
  }

  /**
   * Xóa một cache key cụ thể.
   */
  async del(key: string): Promise<void> {
    await this.redis.del(key);
    this.logger.debug(`[Cache] DEL   ${key}`);
  }

  /**
   * Xóa tất cả cache key khớp với pattern (dùng SCAN để an toàn trên production).
   * Pattern ví dụ: "cache:concert:*"
   */
  async delByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deletedCount = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.redis.del(...keys);
        deletedCount += keys.length;
        this.logger.debug(
          `[Cache] DEL pattern=${pattern} → removed ${keys.length} key(s)`,
        );
      }
    } while (cursor !== '0');

    return deletedCount;
  }

  // ---------------------------------------------------------------------------
  // Cache-aside helper — wraps a DB loader with get-or-set logic
  // ---------------------------------------------------------------------------

  /**
   * Trả về giá trị từ cache nếu có, ngược lại gọi loader() rồi cache kết quả.
   *
   * @param key       Cache key
   * @param ttl       TTL tính bằng giây
   * @param loader    Async function trả về data từ DB
   */
  async getOrSet<T>(
    key: string,
    ttl: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const data = await loader();
    if (data !== null && data !== undefined) {
      await this.set(key, data, ttl);
    }
    return data;
  }

  // ---------------------------------------------------------------------------
  // Domain-specific helpers — key builders
  // ---------------------------------------------------------------------------

  static keyConcertList(): string {
    return 'cache:concert:list';
  }

  static keyConcertDetail(slug: string): string {
    return `cache:concert:detail:${slug}`;
  }

  /**
   * Invalidate tất cả cache liên quan đến một concert cụ thể.
   * Gọi sau khi: order thành công, admin cập nhật concert/ticket.
   */
  async invalidateConcert(slug: string): Promise<void> {
    await Promise.all([
      this.del(CacheService.keyConcertList()),
      this.del(CacheService.keyConcertDetail(slug)),
    ]);
    this.logger.log(`[Cache] Invalidated concert cache for slug="${slug}"`);
  }

  /**
   * Xóa toàn bộ cache concert (ví dụ khi admin bulk-update).
   */
  async invalidateAllConcerts(): Promise<void> {
    const count = await this.delByPattern('cache:concert:*');
    this.logger.log(`[Cache] Invalidated all concert cache (${count} keys)`);
  }
}
