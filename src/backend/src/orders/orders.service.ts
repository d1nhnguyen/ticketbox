import {
  Inject,
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from 'src/prisma/prisma.service';
import { REDIS_CLIENT } from 'src/common/redis/redis.module';
import Redis from 'ioredis';
import { TicketType, OrderStatus } from '@prisma/client';
import { PurchaseDto } from './dto/purchase.dto';
import { PaymentGatewayService } from 'src/payment/payment-gateway.service';
import { PaymentResponse } from 'src/payment/payment.types';
import { randomUUID } from 'crypto';
import { CacheService } from 'src/common/cache/cache.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class OrdersService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly cacheService: CacheService,
    private readonly payment: PaymentGatewayService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue('orders') private readonly ordersQueue: Queue,
  ) { }

  async onModuleInit() {
    await this.ordersQueue.add(
      'release-expired',
      {},
      { repeat: { pattern: '* * * * *' } },
    );
  }

  async createOrder(userId: string, dto: PurchaseDto, idempotencyKey?: string) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key required');
    }

    // ---- #4a: Idempotency PRE-CHECK in Redis (fast path) ----
    const claimed = await this.redis.set(
      `idemp:${idempotencyKey}`,
      'PROCESSING',
      'EX',
      86400, // 24h TTL
      'NX',
    );

    if (claimed === null) {
      const prev = await this.redis.get(`idemp:${idempotencyKey}`);
      if (prev && prev !== 'PROCESSING') {
        return JSON.parse(prev); // return the SAME result
      }
      throw new ConflictException('Duplicate request still processing');
    }

    let order: Awaited<ReturnType<typeof this.prisma.order.create>>;
    let concertSlug: string | undefined;
    try {
      const txResult = await this.prisma.$transaction(async (tx) => {
        // ---- lock the ticket type row → serializes all buyers of this type ----
        const rows = await tx.$queryRaw<TicketType[]>`
          SELECT * FROM "TicketType" WHERE id = ${dto.ticketTypeId} FOR UPDATE
        `;
        const tt = rows[0];
        if (!tt) {
          throw new NotFoundException('Ticket type not found');
        }

        const concert = await tx.concert.findUnique({
          where: { id: tt.concertId },
          select: { slug: true }
        });

        // ---- sale window ----
        if (new Date() < new Date(tt.saleStartsAt)) {
          throw new BadRequestException('Sale has not started');
        }

        // ---- #6: per-user limit (count PAID + still-live PENDING) ----
        const agg = await tx.$queryRaw<{ qty: number }[]>`
          SELECT COALESCE(SUM(oi.quantity), 0)::int AS qty
          FROM "OrderItem" oi
          JOIN "Order" o ON o.id = oi."orderId"
          WHERE o."userId" = ${userId}
            AND oi."ticketTypeId" = ${dto.ticketTypeId}
            AND ( o.status = 'PAID'
                  OR (o.status = 'PENDING' AND o."expiresAt" > now()) )
        `;
        const currentQty = agg[0]?.qty || 0;
        if (currentQty + dto.quantity > tt.maxPerUser) {
          throw new BadRequestException(
            `Per-user limit ${tt.maxPerUser} exceeded (already bought/reserved ${currentQty})`,
          );
        }

        // ---- #1: oversell guard — atomic conditional decrement (the reservation) ----
        const dec = await tx.ticketType.updateMany({
          where: { id: tt.id, remainingQty: { gte: dto.quantity } },
          data: { remainingQty: { decrement: dto.quantity } },
        });
        if (dec.count === 0) {
          throw new ConflictException('Sold out');
        }

        // ---- create PENDING order (10-min hold) ----
        const newOrder = await tx.order.create({
          data: {
            userId,
            concertId: tt.concertId,
            status: OrderStatus.PENDING,
            totalAmount: tt.price * dto.quantity,
            idempotencyKey,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            items: {
              create: [
                {
                  ticketTypeId: tt.id,
                  quantity: dto.quantity,
                  unitPrice: tt.price,
                },
              ],
            },
          },
          include: { items: true },
        });

        return { order: newOrder, concertSlug: concert?.slug };
      });

      order = txResult.order;
      concertSlug = txResult.concertSlug;
    } catch (e) {
      // genuine failure rolled back the whole TX → no order exists → free the key for a real retry
      await this.redis.del(`idemp:${idempotencyKey}`);
      throw e;
    }

    // ---- post-commit side effects ----
    // The order is durably committed (DB @unique on idempotencyKey is the backstop), so a failure
    // here must NOT delete the key or surface as an error — that would falsely report a real order
    // as failed and block the retry.
    try {
      if (concertSlug) {
        await this.cacheService.invalidateConcert(concertSlug);
      } else {
        console.warn(`[OrdersService] No concertSlug found to invalidate!`);
      }
      // store the result so a duplicate key returns the SAME order
      await this.redis.set(
        `idemp:${idempotencyKey}`,
        JSON.stringify(order),
        'EX',
        86400,
      );
    } catch (postErr) {
      console.error(
        '[OrdersService] post-commit side effect failed (order is still created):',
        postErr,
      );
    }

    return order;
  }

  async confirmPayment(orderId: string, userId: string) {
    // ---- pre-check (BEFORE charging) — also our double-charge guard ----
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, tickets: true },
    });
    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }
    if (order.userId !== userId) {
      throw new BadRequestException('Access denied to this order');
    }
    // already paid → idempotent: return the same result, do NOT charge again
    if (order.status === OrderStatus.PAID) {
      return order;
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(`Order is ${order.status}, cannot confirm`);
    }

    // ---- charge through B's circuit-breaker-wrapped gateway ----
    // forward the order's idempotencyKey so a real provider dedups a concurrent double-charge.
    let result: PaymentResponse;
    try {
      result = await this.payment.charge({
        orderId,
        amount: order.totalAmount,
        idempotencyKey: order.idempotencyKey ?? undefined,
      });
    } catch (e) {
      // Circuit OPEN → ServiceUnavailableException thrown by fallback; re-throw as-is
      // so the order stays PENDING and the user can retry.
      if (e instanceof ServiceUnavailableException) throw e;
      // Any other gateway error = hard payment failure → release reservation.
      await this.releaseOrder(orderId);
      throw new BadRequestException('Payment failed');
    }

    if (result.status === 'failed') {
      // Hard failure returned by the gateway → release the reservation.
      await this.releaseOrder(orderId);
      throw new BadRequestException('Payment failed');
    }

    // ---- success → issue tickets (idempotent via conditional flip) ----
    const paid = await this.prisma.$transaction(async (tx) => {
      // conditional flip = idempotency guard: a duplicate/concurrent confirm flips 0 rows and skips re-issuing
      const flip = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.PENDING },
        data: { status: OrderStatus.PAID },
      });

      if (flip.count === 0) {
        return tx.order.findUnique({
          where: { id: orderId },
          include: {
            tickets: { include: { ticketType: true } },
            items: { include: { ticketType: true } },
            concert: true,
          },
        });
      }

      const items = await tx.orderItem.findMany({ where: { orderId } });
      for (const it of items) {
        for (let i = 0; i < it.quantity; i++) {
          await tx.ticket.create({
            data: {
              orderId,
              ticketTypeId: it.ticketTypeId,
              qrCode: randomUUID(),
            },
          });
        }
      }

      return tx.order.findUnique({
        where: { id: orderId },
        include: {
          tickets: { include: { ticketType: true } },
          items: { include: { ticketType: true } },
          concert: true,
        },
      });
    });

    this.eventEmitter.emit('order.paid', paid);
    return paid;
  }

  async failPayment(orderId: string) {
    return this.releaseOrder(orderId);
  }

  /**
   * Flip a PENDING order to FAILED and return its reserved stock — exactly once.
   * The guarded `updateMany` is the idempotency latch: only the caller that flips
   * the row (count === 1) releases stock; a duplicate/lost race flips 0 rows and
   * skips the release, so `remainingQty` is incremented exactly once.
   */
  private async releaseOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { concert: true },
    });

    if (!order) {
      return null;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const flip = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.PENDING },
        data: { status: OrderStatus.FAILED },
      });

      if (flip.count === 1) {
        const items = await tx.orderItem.findMany({ where: { orderId } });
        for (const item of items) {
          await tx.ticketType.update({
            where: { id: item.ticketTypeId },
            data: { remainingQty: { increment: item.quantity } },
          });
        }
      }

      return tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
    });

    if (order.concert?.slug) {
      await this.cacheService.invalidateConcert(order.concert.slug);
    }

    return result;
  }

  async findOne(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        tickets: { include: { ticketType: true } },
        items: { include: { ticketType: true } },
        concert: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    if (order.userId !== userId) {
      throw new BadRequestException('Access denied to this order');
    }

    return order;
  }

  async findAllForUser(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: {
        items: { include: { ticketType: true } },
        tickets: { include: { ticketType: true } },
        concert: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async releaseExpiredOrders() {
    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      select: { id: true },
    });

    let releasedCount = 0;
    for (const order of expiredOrders) {
      await this.prisma.$transaction(async (tx) => {
        const flip = await tx.order.updateMany({
          where: { id: order.id, status: OrderStatus.PENDING },
          data: { status: OrderStatus.EXPIRED },
        });

        if (flip.count === 1) {
          const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
          for (const item of items) {
            await tx.ticketType.update({
              where: { id: item.ticketTypeId },
              data: { remainingQty: { increment: item.quantity } },
            });
          }
          releasedCount++;
        }
      });
    }
    return releasedCount;
  }
}
