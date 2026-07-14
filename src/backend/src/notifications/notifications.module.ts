import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsListener } from './notifications.listener';
import { ReminderService } from './reminder.service';
import { ReminderDebugController } from './reminder-debug.controller';
import { NotificationsController } from './notifications.controller';
import { EmailChannel } from './channels/email.channel';
import { InAppChannel } from './channels/in-app.channel';
import { PrismaService } from 'src/prisma/prisma.service';
import { DemoEnabledGuard } from 'src/common/guards/demo-enabled.guard';

@Module({
  controllers: [ReminderDebugController, NotificationsController],
  imports: [
    BullModule.registerQueue({
      name: 'notifications',
    }),
    ScheduleModule.forRoot(),
  ],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    NotificationsListener,
    ReminderService,
    EmailChannel,
    InAppChannel,
    PrismaService,
    DemoEnabledGuard,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
