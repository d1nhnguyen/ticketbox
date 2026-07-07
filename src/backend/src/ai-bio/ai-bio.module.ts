import { Module } from '@nestjs/common';
import { AiBioService } from './ai-bio.service';
import { AiBioController } from './ai-bio.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [AiBioController],
  providers: [AiBioService, PrismaService],
  exports: [AiBioService],
})
export class AiBioModule {}
