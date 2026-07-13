# Payment & Circuit Breaker Spec

## 1. Description
Integrates the mock payment gateway to process payments. If the payment gateway fails or times out, the circuit breaker opens to prevent recursive system crashes and allows the rest of the application (like browsing tickets) to degrade gracefully instead of full outage. It also ensures payments are idempotent.

## 2. Main Flow
1. **Reservation**: User reserves a seat (creates an `Order` with status `PENDING`, decrementing `remainingQty`).
2. **Payment Request**: User submits payment by calling `POST /orders/:id/pay` with a generated Idempotency Key.
3. **Idempotency Check**: The system checks Redis `SET idemp:<key> NX EX 86400`. If it exists, returns the cached result immediately.
4. **Circuit Breaker**: The system wraps the HTTP call to the external `mock-gateway` via the `opossum` Circuit Breaker.
5. **Success Handling**: If payment is successful:
   - Mark order as `PAID`.
   - Issue `Ticket` records with unique `qrCode`s.
   - Cache the successful idempotency result in Redis.
   - Emit `order.paid` event.

## 3. Error Scenarios
- **Gateway Timeout/Failure**: 
  - Circuit breaker logs failure. If the error threshold (e.g., 50%) is met, it transitions to **OPEN**.
  - Subsequent requests immediately return `503 Service Unavailable` without hitting the gateway.
  - Order remains `PENDING` until it expires.
- **Circuit Breaker Half-Open**: 
  - After a cooling period (e.g., 10s), the breaker allows a single test request. If it succeeds, it closes; if it fails, it re-opens.
- **Idempotency Conflict**: 
  - Submitting an identical idempotency key returns the exact previous response (prevents double charge).
- **Payment Gateway returns 400/Failure**: 
  - Mark order as `FAILED`, release the `remainingQty` hold so others can buy.

## 4. Constraints
- Circuit breaker state resets after a timeout (`CIRCUIT_BREAKER_RESET_TIMEOUT_MS`).
- Gateway mode should be toggleable at demo time via `POST http://localhost:4000/admin/mode` with `{"mode":"failure"}`.

## 5. Acceptance Criteria
- Setting `mock-gateway` to fail causes circuit breaker to open after 5 consecutive failures.
- When circuit is broken, the `GET /concerts` API is completely unaffected.
- Submitting identical payment IDs multiple times only charges once.
- Load testing with `circuit-breaker.js` demonstrates gracefully returning 503s instead of stalling the event loop.
