import {
  Inject,
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { REDIS_CLIENT } from 'src/common/redis/redis.module';
import Redis from 'ioredis';
import { TicketType, OrderStatus } from '@prisma/client';
import { PurchaseDto } from './dto/purchase.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

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

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        // ---- lock the ticket type row → serializes all buyers of this type ----
        const rows = await tx.$queryRaw<TicketType[]>`
          SELECT * FROM "TicketType" WHERE id = ${dto.ticketTypeId} FOR UPDATE
        `;
        const tt = rows[0];
        if (!tt) {
          throw new NotFoundException('Ticket type not found');
        }

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
        return tx.order.create({
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
      });

      // store the result so a duplicate key returns the SAME order
      await this.redis.set(
        `idemp:${idempotencyKey}`,
        JSON.stringify(order),
        'EX',
        86400,
      );
      return order;
    } catch (e) {
      // genuine failure rolled back the whole TX → no order exists → free the key for a real retry
      await this.redis.del(`idemp:${idempotencyKey}`);
      throw e;
    }
  }

  async confirmPayment(orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      // conditional flip = idempotency guard: a duplicate callback flips 0 rows and skips re-issuing
      const flip = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.PENDING },
        data: { status: OrderStatus.PAID },
      });

      if (flip.count === 0) {
        return tx.order.findUnique({
          where: { id: orderId },
          include: { tickets: true, items: true },
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
        include: { tickets: true, items: true },
      });
    });
  }

  async failPayment(orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order || order.status !== OrderStatus.PENDING) {
        return order;
      }

      // flip status
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.FAILED },
      });

      // release stock
      for (const item of order.items) {
        await tx.ticketType.update({
          where: { id: item.ticketTypeId },
          data: { remainingQty: { increment: item.quantity } },
        });
      }

      return tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
    });
  }

  async findOne(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, tickets: true },
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
      include: { items: true, tickets: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
