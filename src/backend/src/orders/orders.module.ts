import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CacheModule } from 'src/common/cache/cache.module';
import { PaymentModule } from 'src/payment/payment.module';
import { BullModule } from '@nestjs/bullmq';
import { OrdersProcessor } from './orders.processor';

@Module({
  imports: [
    CacheModule,
    PaymentModule,
    BullModule.registerQueue({
      name: 'orders',
    }),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, PrismaService, OrdersProcessor],
  exports: [OrdersService],
})
export class OrdersModule { }
