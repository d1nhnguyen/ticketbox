import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentGatewayService } from './payment-gateway.service';
import { PaymentController } from './payment.controller';

@Module({
  imports: [ConfigModule],
  providers: [PaymentGatewayService],
  controllers: [PaymentController],
  exports: [PaymentGatewayService], // exported so OrdersModule can inject it
})
export class PaymentModule {}
