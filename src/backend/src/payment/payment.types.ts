export interface PaymentRequest {
  /** Unique order identifier */
  orderId: string;
  /** Amount to charge (VND) */
  amount: number;
  /** Optional idempotency key (forwarded from client) */
  idempotencyKey?: string;
}

export interface PaymentResponse {
  status: 'success' | 'failed';
  txnId: string;
  orderId: string;
  amount: number;
}

/** Shape returned when the circuit is OPEN (graceful degradation) */
export interface PaymentFallbackResponse {
  status: 'unavailable';
  orderId: string;
  message: string;
  retryAfterMs?: number;
}

export type PaymentResult = PaymentResponse | PaymentFallbackResponse;
