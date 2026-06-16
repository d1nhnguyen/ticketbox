import { Module } from '@nestjs/common';
import { ConcertsController } from './concerts.controller';
import { ConcertsService } from './concerts.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [ConcertsController],
  providers: [ConcertsService, PrismaService],
})
export class ConcertsModule {}
