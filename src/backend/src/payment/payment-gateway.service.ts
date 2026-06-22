import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CircuitBreaker = require('opossum');
import {
  PaymentRequest,
  PaymentResponse,
  PaymentFallbackResponse,
  PaymentResult,
} from './payment.types';

/**
 * PaymentGatewayService — wraps the mock payment gateway with a Circuit Breaker.
 *
 * States (opossum):
 *  CLOSED  → Normal operation; all calls go to mock-gateway.
 *  OPEN    → Too many failures; calls short-circuit immediately to fallback.
 *  HALF-OPEN → Trial requests to check if gateway recovered.
 *
 * Configuration (via .env):
 *  CIRCUIT_BREAKER_TIMEOUT_MS       — per-request timeout (default 5000ms)
 *  CIRCUIT_BREAKER_ERROR_THRESHOLD  — % failures to open circuit (default 50)
 *  CIRCUIT_BREAKER_RESET_TIMEOUT_MS — wait before HALF-OPEN (default 10000ms)
 *  CIRCUIT_BREAKER_VOL_THRESHOLD    — min requests before %check (default 5)
 */
@Injectable()
export class PaymentGatewayService implements OnModuleInit {
  private readonly logger = new Logger(PaymentGatewayService.name);

  private breaker: any;
  private gatewayUrl: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.gatewayUrl = this.configService.get<string>(
      'MOCK_PAYMENT_URL',
      'http://localhost:4000',
    );

    const timeoutMs = parseInt(
      this.configService.get('CIRCUIT_BREAKER_TIMEOUT_MS', '5000'),
    );
    const errorThresholdPercentage = parseInt(
      this.configService.get('CIRCUIT_BREAKER_ERROR_THRESHOLD', '50'),
    );
    const resetTimeoutMs = parseInt(
      this.configService.get('CIRCUIT_BREAKER_RESET_TIMEOUT_MS', '10000'),
    );
    const volumeThreshold = parseInt(
      this.configService.get('CIRCUIT_BREAKER_VOL_THRESHOLD', '5'),
    );

    // The "protected function" — a direct HTTP call to mock-gateway
    this.breaker = new CircuitBreaker(this.callGateway.bind(this), {
      timeout: timeoutMs,
      errorThresholdPercentage,
      resetTimeout: resetTimeoutMs,
      volumeThreshold,
      name: 'payment-gateway',
    });

    // ---- Event hooks for logging/observability ----
    this.breaker.on('open', () =>
      this.logger.warn(
        `[CircuitBreaker] State → OPEN (gateway unreachable). Graceful degradation active.`,
      ),
    );
    this.breaker.on('halfOpen', () =>
      this.logger.log(
        `[CircuitBreaker] State → HALF-OPEN (testing recovery...)`,
      ),
    );
    this.breaker.on('close', () =>
      this.logger.log(`[CircuitBreaker] State → CLOSED (gateway recovered ✓)`),
    );
    this.breaker.on('fallback', (result) =>
      this.logger.warn(
        `[CircuitBreaker] Fallback triggered. Result: ${JSON.stringify(result)}`,
      ),
    );
    this.breaker.on('timeout', () =>
      this.logger.warn(
        `[CircuitBreaker] Request timed out after ${timeoutMs}ms`,
      ),
    );
    this.breaker.on('reject', () =>
      this.logger.warn(`[CircuitBreaker] Request rejected — circuit is OPEN`),
    );

    // Fallback executed when the circuit is OPEN
    this.breaker.fallback((req: PaymentRequest) => {
      const fallback: PaymentFallbackResponse = {
        status: 'unavailable',
        orderId: req.orderId,
        message:
          'Payment service is currently unavailable. Your order is saved. Please retry in a moment.',
        retryAfterMs: resetTimeoutMs,
      };
      return fallback;
    });

    this.logger.log(
      `[CircuitBreaker] Initialized — gateway: ${this.gatewayUrl} | timeout: ${timeoutMs}ms | errorThreshold: ${errorThresholdPercentage}% | resetTimeout: ${resetTimeoutMs}ms`,
    );
  }

  /**
   * Charge a payment. Returns success response OR a graceful fallback when circuit is OPEN.
   */
  async charge(req: PaymentRequest): Promise<PaymentResult> {
    return this.breaker.fire(req) as Promise<PaymentResult>;
  }

  /**
   * Expose current circuit breaker state for health/monitoring endpoints.
   */
  getStatus(): {
    state: string;
    stats: {
      fires: number;
      failures: number;
      successes: number;
      timeouts: number;
      rejects: number;
      fallbacks: number;
    };
  } {
    const stats = this.breaker.stats;
    return {
      state: this.breaker.opened
        ? 'OPEN'
        : this.breaker.halfOpen
          ? 'HALF-OPEN'
          : 'CLOSED',
      stats: {
        fires: stats.fires,
        failures: stats.failures,
        successes: stats.successes,
        timeouts: stats.timeouts,
        rejects: stats.rejects,
        fallbacks: stats.fallbacks,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Private: the actual HTTP call to mock-gateway
  // ---------------------------------------------------------------------------
  private async callGateway(req: PaymentRequest): Promise<PaymentResponse> {
    const url = `${this.gatewayUrl}/pay`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: req.orderId, amount: req.amount }),
    });

    if (!response.ok) {
      // Treat non-2xx as a failure so the breaker counts it
      const body = await response.text();
      throw new Error(`Gateway responded with ${response.status}: ${body}`);
    }

    return response.json() as Promise<PaymentResponse>;
  }
}
