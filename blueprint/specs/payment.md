# Payment & Circuit Breaker Spec

## Description
Integrates the mock payment gateway to process payments. If the payment gateway fails or times out, the circuit breaker opens to prevent recursive system crashes and allows the rest of the application (like browsing tickets) to degrade gracefully instead of full outage. It also ensures payments are idempotent.

## Main Flow
1. User reserves a seat (creates a `PENDING` order).
2. User submits payment calling `/pay`.
3. Circuit breaker wraps call to the `mock-gateway`.
4. If payment is successful, Mark order `PAID` and issue ticket.

## Error Scenarios
- **Gateway Timeout**: Circuit breaker counts failure. If threshold is met, it opens.
- **Circuit Breaker Open**: Fast-fails the payment attempt.
- **Duplicate Request**: Idempotency Key intercepts and returns the exact previous response without triggering another charge.

## Constraints
- Circuit breaker state resets after a timeout (Half-Open).
- Gateway mode should be toggleable at demo time via `/admin/mode`.

## Acceptance Criteria
- Setting `mock-gateway` to fail causes circuit breaker to open after 3 consecutive failures.
- When circuit is broken, the `GET /concerts` API is completely unaffected.
- Submitting identical payment IDs multiple times only charges once.
