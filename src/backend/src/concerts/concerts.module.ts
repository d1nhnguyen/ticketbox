import { Module } from '@nestjs/common';
import { ConcertsController } from './concerts.controller';
import { ConcertsAdminController } from './concerts.admin.controller';
import { ConcertsService } from './concerts.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [ConcertsController, ConcertsAdminController],
  providers: [ConcertsService, PrismaService],
  exports: [ConcertsService],
})
export class ConcertsModule {}
