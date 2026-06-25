import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CheckinController } from './checkin.controller';
import { CheckinService } from './checkin.service';

@Module({
  controllers: [CheckinController],
  providers: [CheckinService, PrismaService],
})
export class CheckinModule {}
