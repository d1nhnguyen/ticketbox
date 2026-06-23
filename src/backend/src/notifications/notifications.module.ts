import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsListener } from './notifications.listener';
import { EmailChannel } from './channels/email.channel';
import { InAppChannel } from './channels/in-app.channel';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'notifications',
    }),
  ],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    NotificationsListener,
    EmailChannel,
    InAppChannel,
    PrismaService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
