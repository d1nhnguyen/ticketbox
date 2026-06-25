import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { addHours } from 'date-fns';

/**
 * Cron chạy mỗi 15 phút, quét các concert bắt đầu trong khoảng [now+23h45, now+24h15].
 * Với mỗi đơn hàng PAID, gọi enqueueOnce → dedup → gửi in-app notification 1 lần duy nhất.
 */
@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('*/15 * * * *')
  async sendReminders(): Promise<void> {
    const now = new Date();
    const windowStart = addHours(now, 23.75); // now + 23h45
    const windowEnd = addHours(now, 24.25);   // now + 24h15

    this.logger.log(
      `[ReminderCron] Running — scanning concerts in [${windowStart.toISOString()}, ${windowEnd.toISOString()}]`,
    );

    const concerts = await this.prisma.concert.findMany({
      where: {
        startsAt: { gte: windowStart, lte: windowEnd },
        status: 'ON_SALE',
      },
      include: {
        orders: {
          where: { status: 'PAID' },
          select: { userId: true, id: true },
        },
      },
    });

    if (concerts.length === 0) {
      this.logger.debug('[ReminderCron] No concerts in 24h window');
      return;
    }

    this.logger.log(
      `[ReminderCron] Found ${concerts.length} concert(s) to remind`,
    );

    for (const concert of concerts) {
      for (const order of concert.orders) {
        await this.notificationsService.enqueueOnce(order.userId, 'REMINDER_24H', {
          concertId: concert.id,
          concertName: concert.title,
          startsAt: concert.startsAt,
        });
      }
    }
  }
}
