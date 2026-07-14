import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GuestsController } from './guests.controller';
import { GuestVerificationController } from './guest-verification.controller';
import { GuestsService } from './guests.service';
import { GuestsProcessor } from './guests.processor';
import { InboxPollerService } from './inbox-poller.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'guests',
    }),
  ],
  controllers: [GuestsController, GuestVerificationController],
  providers: [GuestsService, GuestsProcessor, InboxPollerService, PrismaService],
  exports: [GuestsService],
})
export class GuestsModule {}
