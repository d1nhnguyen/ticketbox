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
