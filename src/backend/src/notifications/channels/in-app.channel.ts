import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationStatus } from '@prisma/client';
import { NotificationChannel, NotificationPayload } from './notification-channel.interface';

@Injectable()
export class InAppChannel implements NotificationChannel {
  private readonly logger = new Logger(InAppChannel.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(payload: NotificationPayload): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userId: payload.userId,
          channel: 'IN_APP',
          type: payload.type,
          payload: payload.data,
          status: NotificationStatus.SENT,
          sentAt: new Date(),
        },
      });
      this.logger.log(`[InAppChannel] In-app notification created for user ${payload.userId}`);
    } catch (error) {
      this.logger.error(`[InAppChannel] Failed to create in-app notification: ${error}`);
      throw error;
    }
  }
}
