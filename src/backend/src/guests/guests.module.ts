import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GuestsController } from './guests.controller';
import { GuestsService } from './guests.service';
import { GuestsProcessor } from './guests.processor';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'guests',
    }),
  ],
  controllers: [GuestsController],
  providers: [GuestsService, GuestsProcessor, PrismaService],
  exports: [GuestsService],
})
export class GuestsModule {}
