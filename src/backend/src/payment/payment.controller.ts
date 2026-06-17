import { Controller, Post, Body, Get, Logger } from '@nestjs/common';
import { PaymentGatewayService } from './payment-gateway.service';
import type { PaymentRequest } from './payment.types';
import { SkipRateLimit } from 'src/common/decorators/rate-limit.decorator';

/**
 * PaymentController — exposes payment endpoints and a circuit-breaker status endpoint.
 *
 * POST /payment/charge   → attempt a payment charge (used internally by OrdersService)
 * GET  /payment/status   → returns current circuit breaker state (for demo/monitoring)
 */
@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly gatewayService: PaymentGatewayService) {}

  @Post('charge')
  async charge(@Body() body: PaymentRequest) {
    this.logger.log(`Charging order ${body.orderId} — amount: ${body.amount}`);
    const result = await this.gatewayService.charge(body);
    this.logger.log(`Charge result for ${body.orderId}: ${result.status}`);
    return result;
  }

  /**
   * Circuit breaker status — useful during demo to show state transitions.
   * Skip rate limit so monitoring tools can always reach it.
   */
  @SkipRateLimit()
  @Get('status')
  circuitBreakerStatus() {
    return this.gatewayService.getStatus();
  }
}
