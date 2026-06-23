import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CacheModule } from 'src/common/cache/cache.module';
import { PaymentModule } from 'src/payment/payment.module';

@Module({
  imports: [CacheModule, PaymentModule],
  controllers: [OrdersController],
  providers: [OrdersService, PrismaService],
  exports: [OrdersService],
})
export class OrdersModule { }
