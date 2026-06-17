import { Module } from '@nestjs/common';
import { ConcertsController } from './concerts.controller';
import { ConcertsService } from './concerts.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CacheModule } from 'src/common/cache/cache.module';

@Module({
  imports: [CacheModule],
  controllers: [ConcertsController],
  providers: [ConcertsService, PrismaService],
  // Export ConcertsService để OrdersModule gọi invalidateCache() sau khi PAID
  exports: [ConcertsService],
})
export class ConcertsModule {}
