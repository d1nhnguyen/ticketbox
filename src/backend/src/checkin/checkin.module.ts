import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CheckinController } from './checkin.controller';
import { CheckinService } from './checkin.service';
import { ScannerDataController } from './scanner-data.controller';

@Module({
  controllers: [CheckinController, ScannerDataController],
  providers: [CheckinService, PrismaService],
})
export class CheckinModule {}
