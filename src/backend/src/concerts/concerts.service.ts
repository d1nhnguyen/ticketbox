import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConcertStatus, OrderStatus, TicketStatus } from '@prisma/client';
import { CreateConcertDto } from './dto/create-concert.dto';
import { UpdateConcertDto } from './dto/update-concert.dto';
import {
  CONCERT_CANCELLED_EVENT,
  ConcertCancelledEvent,
} from './events/concert-cancelled.event';

@Injectable()
export class ConcertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Public (audience) ───────────────────────────────────────────────────

  findAll() {
    return this.prisma.concert.findMany({
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
    });
  }

  findBySlug(slug: string) {
    return this.prisma.concert.findUnique({
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
    });
  }

  // ─── Admin (organizer) ───────────────────────────────────────────────────

  adminFindAll() {
    return this.prisma.concert.findMany({
      select: {
        id: true,
        title: true,
        slug: true,
        venue: true,
        startsAt: true,
        status: true,
        createdAt: true,
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  async adminFindById(id: string) {
    const concert = await this.prisma.concert.findUnique({
      where: { id },
      include: {
        ticketTypes: {
          orderBy: { price: 'desc' },
        },
      },
    });
    if (!concert) throw new NotFoundException(`Concert ${id} not found`);
    return concert;
  }

  async create(dto: CreateConcertDto) {
    try {
      return await this.prisma.concert.create({
        data: {
          title: dto.title,
          slug: dto.slug,
          venue: dto.venue,
          startsAt: new Date(dto.startsAt),
          status: dto.status ?? ConcertStatus.DRAFT,
          artistBio: dto.artistBio,
          bioSourceUrl: dto.bioSourceUrl,
          seatMapSvg: dto.seatMapSvg,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException(`Slug "${dto.slug}" is already taken`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateConcertDto) {
    await this.adminFindById(id); // 404 guard
    try {
      return await this.prisma.concert.update({
        where: { id },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.slug !== undefined && { slug: dto.slug }),
          ...(dto.venue !== undefined && { venue: dto.venue }),
          ...(dto.startsAt !== undefined && { startsAt: new Date(dto.startsAt) }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.artistBio !== undefined && { artistBio: dto.artistBio }),
          ...(dto.bioSourceUrl !== undefined && { bioSourceUrl: dto.bioSourceUrl }),
          ...(dto.seatMapSvg !== undefined && { seatMapSvg: dto.seatMapSvg }),
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException(`Slug "${dto.slug}" is already taken`);
      }
      throw e;
    }
  }

  async remove(id: string) {
    const concert = await this.adminFindById(id);
    if (concert.status !== ConcertStatus.DRAFT) {
      throw new BadRequestException(
        'Only DRAFT concerts can be deleted. Use cancel for ON_SALE concerts.',
      );
    }
    const orderCount = await this.prisma.order.count({ where: { concertId: id } });
    if (orderCount > 0) {
      throw new ConflictException(
        'Cannot delete a concert with existing orders. Use cancel instead.',
      );
    }
    await this.prisma.concert.delete({ where: { id } });
    return { deleted: true };
  }

  async cancel(id: string) {
    const concert = await this.adminFindById(id);

    // Idempotent: already cancelled → return without re-emitting
    if (concert.status === ConcertStatus.CANCELLED) {
      return concert;
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Mark concert CANCELLED
      await tx.concert.update({
        where: { id },
        data: { status: ConcertStatus.CANCELLED },
      });

      // 2. Release stock for PENDING orders and flip them to FAILED
      const pendingOrders = await tx.order.findMany({
        where: { concertId: id, status: OrderStatus.PENDING },
        include: { items: true },
      });

      for (const order of pendingOrders) {
        for (const item of order.items) {
          await tx.ticketType.update({
            where: { id: item.ticketTypeId },
            data: { remainingQty: { increment: item.quantity } },
          });
        }
      }

      if (pendingOrders.length > 0) {
        await tx.order.updateMany({
          where: { concertId: id, status: OrderStatus.PENDING },
          data: { status: OrderStatus.FAILED },
        });
      }

      // 3. Void all VALID tickets for this concert's ticket types
      const ticketTypeIds = concert.ticketTypes.map((tt) => tt.id);
      if (ticketTypeIds.length > 0) {
        await tx.ticket.updateMany({
          where: {
            ticketTypeId: { in: ticketTypeIds },
            status: TicketStatus.VALID,
          },
          data: { status: TicketStatus.CANCELLED },
        });
      }
    });

    // Collect buyer userIds (PAID orders) for the notification event
    const paidOrders = await this.prisma.order.findMany({
      where: { concertId: id, status: OrderStatus.PAID },
      select: { userId: true },
      distinct: ['userId'],
    });
    const buyerUserIds = paidOrders.map((o) => o.userId);

    // Emit for Person B's notifications module to subscribe when ready
    this.eventEmitter.emit(
      CONCERT_CANCELLED_EVENT,
      new ConcertCancelledEvent(id, concert.title, buyerUserIds),
    );

    return this.adminFindById(id);
  }

  async getStats(concertId: string) {
    await this.adminFindById(concertId); // 404 guard

    // Aggregate PAID revenue + order count for the concert
    const agg = await this.prisma.order.aggregate({
      where: { concertId, status: OrderStatus.PAID },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    // Per-ticket-type sold quantity and revenue (from PAID order items)
    const perTypeRaw = await this.prisma.$queryRaw<
      { ticketTypeId: string; soldQty: number; revenue: number }[]
    >`
      SELECT
        oi."ticketTypeId",
        COALESCE(SUM(oi.quantity), 0)::int       AS "soldQty",
        COALESCE(SUM(oi.quantity * oi."unitPrice"), 0)::int AS "revenue"
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      WHERE o."concertId" = ${concertId}
        AND o.status = 'PAID'
      GROUP BY oi."ticketTypeId"
    `;

    const statsById = Object.fromEntries(
      perTypeRaw.map((r) => [r.ticketTypeId, r]),
    );

    const ticketTypes = await this.prisma.ticketType.findMany({
      where: { concertId },
      orderBy: { price: 'desc' },
    });

    return {
      concertId,
      totalRevenue: agg._sum.totalAmount ?? 0,
      totalOrders: agg._count.id,
      ticketTypes: ticketTypes.map((tt) => {
        const s = statsById[tt.id];
        return {
          id: tt.id,
          name: tt.name,
          price: tt.price,
          totalQty: tt.totalQty,
          remainingQty: tt.remainingQty,
          soldQty: s?.soldQty ?? 0,
          revenue: s?.revenue ?? 0,
        };
      }),
    };
  }
}
