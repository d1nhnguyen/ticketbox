import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationChannel, NotificationPayload } from './channels/notification-channel.interface';
import { EmailChannel } from './channels/email.channel';
import { InAppChannel } from './channels/in-app.channel';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private channels: Map<string, NotificationChannel> = new Map();

  constructor(
    private readonly emailChannel: EmailChannel,
    private readonly inAppChannel: InAppChannel,
    private readonly prisma: PrismaService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {
    this.channels.set('EMAIL', this.emailChannel);
    this.channels.set('IN_APP', this.inAppChannel);
  }

  async send(channelName: string, payload: NotificationPayload): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      this.logger.warn(`Channel ${channelName} not found`);
      return;
    }
    await channel.send(payload);
  }

  /**
   * Enqueue một in-app notification, dedup theo (userId, type, concertId).
   * Nếu đã tồn tại notification cùng (userId, type, concertId) thì bỏ qua — không gửi 2 lần.
   */
  async enqueueOnce(
    userId: string,
    type: string,
    meta: Record<string, any>,
  ): Promise<void> {
    // Dedup: kiểm tra xem đã có notification (userId, type, concertId) chưa
    const exists = await this.prisma.notification.findFirst({
      where: {
        userId,
        type,
        payload: { path: ['concertId'], equals: meta.concertId },
      },
    });

    if (exists) {
      this.logger.debug(
        `[enqueueOnce] Duplicate skipped — userId=${userId} type=${type} concertId=${meta.concertId}`,
      );
      return;
    }

    await this.notificationsQueue.add('notification.send', {
      channel: 'IN_APP',
      payload: {
        userId,
        type,
        data: {
          title: 'Nhắc nhở: Sự kiện sắp bắt đầu',
          message: 'Sự kiện của bạn bắt đầu sau 24h!',
          ...meta,
        },
      },
    });

    this.logger.log(
      `[enqueueOnce] Queued reminder — userId=${userId} concertId=${meta.concertId}`,
    );
  }
}
