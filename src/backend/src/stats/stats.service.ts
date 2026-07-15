import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { OrderStatus, TicketStatus } from '@prisma/client';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(days: number) {
    const clampedDays = Math.min(Math.max(days || 30, 1), 90);
    const since = new Date();
    since.setDate(since.getDate() - (clampedDays - 1));
    since.setHours(0, 0, 0, 0);

    const [revenueAgg, totalConcerts, checkedInCount, salesByDayRaw, ticketTypeBreakdown, concertsRaw] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: { status: OrderStatus.PAID },
          _sum: { totalAmount: true },
          _count: { id: true },
        }),
        this.prisma.concert.count(),
        this.prisma.ticket.count({ where: { status: TicketStatus.USED } }),
        // Ngày quy đổi theo giờ VN vì đây là thị trường mục tiêu của sản phẩm.
        this.prisma.$queryRaw<{ date: string; tickets: number; revenue: number }[]>`
          SELECT
            to_char(o."createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS date,
            COALESCE(SUM(oi.quantity), 0)::int AS tickets,
            COALESCE(SUM(oi.quantity * oi."unitPrice"), 0)::int AS revenue
          FROM "Order" o
          JOIN "OrderItem" oi ON oi."orderId" = o.id
          WHERE o.status = 'PAID' AND o."createdAt" >= ${since}
          GROUP BY 1
          ORDER BY 1
        `,
        this.prisma.$queryRaw<
          { ticketTypeId: string; name: string; concertTitle: string; soldQty: number; revenue: number }[]
        >`
          SELECT
            tt.id AS "ticketTypeId",
            tt.name,
            c.title AS "concertTitle",
            COALESCE(SUM(oi.quantity), 0)::int AS "soldQty",
            COALESCE(SUM(oi.quantity * oi."unitPrice"), 0)::int AS revenue
          FROM "OrderItem" oi
          JOIN "Order" o ON o.id = oi."orderId" AND o.status = 'PAID'
          JOIN "TicketType" tt ON tt.id = oi."ticketTypeId"
          JOIN "Concert" c ON c.id = tt."concertId"
          GROUP BY tt.id, tt.name, c.title
          ORDER BY "soldQty" DESC
        `,
        this.prisma.$queryRaw<
          {
            id: string;
            title: string;
            startsAt: Date;
            status: string;
            capacity: number;
            ticketsSold: number;
            revenue: number;
          }[]
        >`
          SELECT
            c.id,
            c.title,
            c."startsAt",
            c.status,
            COALESCE(cap.capacity, 0)::int AS capacity,
            COALESCE(sold."ticketsSold", 0)::int AS "ticketsSold",
            COALESCE(sold.revenue, 0)::int AS revenue
          FROM "Concert" c
          LEFT JOIN (
            SELECT "concertId", SUM("totalQty")::int AS capacity
            FROM "TicketType"
            GROUP BY "concertId"
          ) cap ON cap."concertId" = c.id
          LEFT JOIN (
            SELECT tt."concertId",
              SUM(oi.quantity)::int AS "ticketsSold",
              SUM(oi.quantity * oi."unitPrice")::int AS revenue
            FROM "OrderItem" oi
            JOIN "Order" o ON o.id = oi."orderId" AND o.status = 'PAID'
            JOIN "TicketType" tt ON tt.id = oi."ticketTypeId"
            GROUP BY tt."concertId"
          ) sold ON sold."concertId" = c.id
          ORDER BY c."startsAt" DESC
        `,
      ]);

    return {
      totals: {
        totalRevenue: revenueAgg._sum.totalAmount ?? 0,
        ticketsSold: ticketTypeBreakdown.reduce((sum, t) => sum + t.soldQty, 0),
        totalOrders: revenueAgg._count.id,
        totalConcerts,
        checkedInCount,
      },
      salesByDay: this.zeroFillDays(salesByDayRaw, since, clampedDays),
      ticketTypeBreakdown,
      concerts: concertsRaw,
    };
  }

  private zeroFillDays(
    rows: { date: string; tickets: number; revenue: number }[],
    since: Date,
    days: number,
  ) {
    const byDate = new Map(rows.map((r) => [r.date, r]));
    const result: { date: string; tickets: number; revenue: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      result.push(byDate.get(key) ?? { date: key, tickets: 0, revenue: 0 });
    }
    return result;
  }
}
