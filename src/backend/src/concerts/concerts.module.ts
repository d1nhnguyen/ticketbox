import { Module } from '@nestjs/common';
import { ConcertsController } from './concerts.controller';
import { ConcertsAdminController } from './concerts.admin.controller';
import { ConcertsService } from './concerts.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CacheModule } from 'src/common/cache/cache.module';

@Module({
  imports: [CacheModule],
  controllers: [ConcertsController, ConcertsAdminController],
  providers: [ConcertsService, PrismaService],
  // Export ConcertsService để OrdersModule gọi invalidateCache() sau khi PAID
  exports: [ConcertsService],
})
export class ConcertsModule { }
