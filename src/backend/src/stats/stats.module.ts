import { Module } from '@nestjs/common';
import { StatsAdminController } from './stats.admin.controller';
import { StatsService } from './stats.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [StatsAdminController],
  providers: [StatsService, PrismaService],
})
export class StatsModule {}
