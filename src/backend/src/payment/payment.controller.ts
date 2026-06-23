import { Controller, Post, Body, Get, Logger } from '@nestjs/common';
import { PaymentGatewayService } from './payment-gateway.service';
import type { PaymentRequest } from './payment.types';
import {
  SkipRateLimit,
  RateLimitConfig,
} from 'src/common/decorators/rate-limit.decorator';

/**
 * PaymentController — exposes payment endpoints and a circuit-breaker status endpoint.
 *
 * POST /payment/charge   → attempt a payment charge (used internally by OrdersService)
 * GET  /payment/status   → returns current circuit breaker state (for demo/monitoring)
 *
 * Rate limit strategy:
 *   - /charge uses a STRICTER bucket than global browsing endpoints.
 *     capacity=20 (burst), refillRate=2/s (sustained) → max ~120 payment attempts/min.
 *     This mirrors WEEK2_GUIDE: "put a stricter bucket on the purchase endpoint than on browsing."
 *   - When OrdersService (Person A) is built, apply the same @RateLimitConfig on
 *     POST /orders as well.
 */
@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly gatewayService: PaymentGatewayService) { }

  /**
   * Stricter rate limit — values read from env
   *   PAYMENT_RATE_LIMIT_CAPACITY
   *   PAYMENT_RATE_LIMIT_REFILL_RATE
   */
  @RateLimitConfig({
    paymentCapacity: 'PAYMENT_RATE_LIMIT_CAPACITY',
    paymentRefillRate: 'PAYMENT_RATE_LIMIT_REFILL_RATE',
    keyStrategy: 'ip',
  })
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

  /**
   * Reset circuit breaker to CLOSED state.
   * Only for demo/dev — does NOT need auth (no sensitive data exposed).
   * Skip rate limit so the test script can always call this.
   */
  @SkipRateLimit()
  @Post('reset')
  resetCircuitBreaker() {
    this.gatewayService.reset();
    const status = this.gatewayService.getStatus();
    this.logger.log('[PaymentController] Circuit breaker reset via API');
    return { message: 'Circuit breaker reset to CLOSED', state: status.state };
  }
}
