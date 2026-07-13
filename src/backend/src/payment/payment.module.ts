import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentGatewayService } from './payment-gateway.service';
import { PaymentController } from './payment.controller';
import { VNPayService } from './vnpay.service';

@Module({
  imports: [ConfigModule],
  providers: [PaymentGatewayService, VNPayService],
  controllers: [PaymentController],
  exports: [PaymentGatewayService, VNPayService], // exported so OrdersModule can inject it
})
export class PaymentModule {}
