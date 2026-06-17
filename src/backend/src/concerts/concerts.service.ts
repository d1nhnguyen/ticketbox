import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CacheService } from 'src/common/cache/cache.service';

/**
 * ConcertsService — CRUD + Cache-aside (Cơ chế #7).
 *
 * Chiến lược caching:
 *   - findAll()      → cache:concert:list     (TTL 2 phút)
 *   - findBySlug()   → cache:concert:detail:<slug> (TTL 1 phút)
 *
 * Invalidation:
 *   - invalidateBySlug(slug): gọi từ OrdersService sau khi order PAID thành công
 *     → xóa cả list và detail để remaining không bị stale.
 *   - invalidateAll(): gọi khi admin cập nhật / hủy concert.
 */
@Injectable()
export class ConcertsService {
  private readonly logger = new Logger(ConcertsService.name);

  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public read APIs — sử dụng cache-aside
  // ---------------------------------------------------------------------------

  /**
   * Danh sách concerts (không bao gồm DRAFT).
   * TTL dài hơn vì danh sách ít thay đổi realtime.
   */
  async findAll() {
    const cacheKey = CacheService.keyConcertList();
    return this.cacheService.getOrSet(
      cacheKey,
      CacheService.TTL_CONCERT_LIST,
      () =>
        this.prisma.concert.findMany({
          where: { status: { not: 'DRAFT' } },
          select: {
            id: true,
            title: true,
            slug: true,
            venue: true,
            startsAt: true,
            status: true,
          },
          orderBy: { startsAt: 'asc' },
        }),
    );
  }

  /**
   * Chi tiết concert kèm ticketTypes (bao gồm remainingQty).
   * TTL ngắn hơn vì remainingQty thay đổi sau mỗi lần mua vé.
   */
  async findBySlug(slug: string) {
    const cacheKey = CacheService.keyConcertDetail(slug);
    return this.cacheService.getOrSet(
      cacheKey,
      CacheService.TTL_CONCERT_DETAIL,
      () =>
        this.prisma.concert.findUnique({
          where: { slug },
          include: {
            ticketTypes: {
              select: {
                id: true,
                name: true,
                price: true,
                totalQty: true,
                remainingQty: true,
                maxPerUser: true,
                saleStartsAt: true,
              },
              orderBy: { price: 'desc' },
            },
          },
        }),
    );
  }

  // ---------------------------------------------------------------------------
  // Cache invalidation — gọi từ OrdersService hoặc Admin endpoints
  // ---------------------------------------------------------------------------

  /**
   * Xóa cache của một concert cụ thể (list + detail).
   * Gọi sau khi có order PAID thành công để remaining cập nhật sớm.
   *
   * @param slug slug của concert liên quan đến order
   */
  async invalidateCache(slug: string): Promise<void> {
    await this.cacheService.invalidateConcert(slug);
    this.logger.log(
      `[ConcertsService] Cache invalidated for concert slug="${slug}"`,
    );
  }

  /**
   * Xóa toàn bộ cache concert.
   * Dùng khi admin bulk-update hoặc hủy concert.
   */
  async invalidateAllCache(): Promise<void> {
    await this.cacheService.invalidateAllConcerts();
  }
}
