# TicketBox — Week 2 Implementation Guide

> Goal by **Day 12**: a full **paid purchase works end-to-end** (select → pay via mock gateway → e-ticket QR), and the **consistency mechanisms are proven under concurrency by load tests** — not just "it ran once".
> This is the **graded week**. Points are won and lost here.

**Stack reminder:** NestJS + Prisma + PostgreSQL + Redis + BullMQ · React (Vite) · `opossum` (circuit breaker) · `k6` (load tests).

> ⚠️ **Read this first.** plan.md §0: *"AI routinely produces concurrency code that looks correct but has a race. These are the graded parts."* Every mechanism below is "done" only when its **load test passes repeatedly**, not when it compiles. Do not trust AI-generated code for #1/#4/#6 — prove it.

---

## Order of work & dependencies

```
PREREQ (from Week 1): A's schema+auth done · B's mock gateway running · C's UI shell on mock data

DAY 6 ── parallel ──
  A: purchase flow skeleton (PENDING order + reservation)
  B: rate limiting (Token Bucket)        C: purchase UI flow (select type/qty)
DAY 7-9
  A: #1 oversell + #6 per-user limit + #4a idempotency  (+ write load tests AS YOU GO)
  B: #3 circuit breaker (wraps payment) + #7 caching     C: SVG zone map + real-time remaining
DAY 10-11
  A: payment confirm → issue tickets + QR  ← unblocks C's e-ticket screen
  B: notifications (BullMQ) + reservation-expiry worker  C: admin UI + in-app notifications
DAY 12  ✅ end-to-end buy → e-ticket; run ALL load tests together
```

**Hard dependencies:**
1. B's **mock gateway** (Week 1) must work before A wires payment.
2. A's **reservation model** (`expiresAt` decrement-on-PENDING) must be agreed with B before B builds the **expiry worker**.
3. A's **payment-confirm → ticket+QR** must land before C's **e-ticket screen** works end-to-end.
4. B's **cache invalidation** hooks into A's **successful-purchase** event — agree the hook point Day 7.

---

## The 6 mechanisms demoed this week

| # | Problem | Owner | Where | "Done" = this load test passes |
|---|---|---|---|---|
| 1 | Oversell / race on last ticket | A | `orders/` | `oversell.js`: fire N > stock concurrent buys → sold **exactly** ≤ stock, zero negative remaining |
| 6 | Per-user limit under load | A | `orders/` | `per-user-limit.js`: many concurrent buys from one account → never exceeds `maxPerUser` |
| 4a | No double charge | A | `orders/` | same Idempotency-Key sent twice → **one** order, one charge |
| 2 | Traffic spike | B | `common/rate-limit` | `rate-limit.js`: burst → excess get HTTP 429 fairly |
| 3 | Payment gateway unstable | B | `payment/` | toggle gateway to fail → breaker opens, **browsing still works**, no full outage |
| 7 | Read-heavy overload | B | `concerts/` + `common/cache` | load on list/detail → DB query count drops; `remaining` still ~accurate after a buy |

> #4b (offline double-scan) is **Week 3** — not this week.

---

# PERSON A — Commerce & Consistency (the graded core)

Your week, in order: **purchase flow → #1 → #6 → #4a → payment-confirm/issue → admin → load tests.**
Write each load test the moment its mechanism is in, not at the end.

## A1. Purchase flow + the three concurrency mechanisms (ONE transaction)

The trick: **#1, #6, and the reservation all live in a single DB transaction**, serialized through a row lock on the ticket type. This is what makes them provably correct.

### Why a row lock
- **#1 oversell:** the atomic conditional `UPDATE ... WHERE remainingQty >= qty` is race-free on its own.
- **#6 per-user limit:** counting "how many has this user already bought" and then inserting is a **read-then-write race** — two concurrent requests both read 0, both pass. The conditional-update trick does **not** work for a per-user *count*. So you must serialize buyers of the same ticket type through `SELECT ... FOR UPDATE` on the `TicketType` row. Then the count is reliable.

> This serializes purchases **per ticket type** (pessimistic). That's the honest tradeoff: correctness over raw throughput. State it in the video — examiners reward understanding the tradeoff over a false "lock-free and perfectly safe" claim.

### The service method (`orders/orders.service.ts`)
```ts
async createOrder(userId: string, dto: PurchaseDto, idempotencyKey: string) {
  if (!idempotencyKey) throw new BadRequestException('Idempotency-Key required');

  // ---- #4a: Idempotency PRE-CHECK in Redis (fast path) ----
  // SET NX returns null if the key already exists → duplicate request.
  const claimed = await this.redis.set(
    `idemp:${idempotencyKey}`, 'PROCESSING', 'NX', 'EX', 86400, // 24h TTL
  );
  if (claimed === null) {
    const prev = await this.redis.get(`idemp:${idempotencyKey}`);
    if (prev && prev !== 'PROCESSING') return JSON.parse(prev); // return the SAME result
    throw new ConflictException('Duplicate request still processing');
  }

  try {
    const order = await this.prisma.$transaction(async (tx) => {
      // ---- lock the ticket type row → serializes all buyers of this type ----
      const rows = await tx.$queryRaw<TicketTypeRow[]>`
        SELECT * FROM "TicketType" WHERE id = ${dto.ticketTypeId} FOR UPDATE
      `;
      const tt = rows[0];
      if (!tt) throw new NotFoundException('Ticket type not found');

      // ---- sale window ----
      if (new Date() < tt.saleStartsAt)
        throw new BadRequestException('Sale has not started');

      // ---- #6: per-user limit (count PAID + still-live PENDING) ----
      const agg = await tx.$queryRaw<{ qty: number }[]>`
        SELECT COALESCE(SUM(oi.quantity), 0)::int AS qty
        FROM "OrderItem" oi
        JOIN "Order" o ON o.id = oi."orderId"
        WHERE o."userId" = ${userId}
          AND oi."ticketTypeId" = ${dto.ticketTypeId}
          AND ( o.status = 'PAID'
                OR (o.status = 'PENDING' AND o."expiresAt" > now()) )
      `;
      if (agg[0].qty + dto.quantity > tt.maxPerUser)
        throw new BadRequestException(
          `Per-user limit ${tt.maxPerUser} exceeded (already ${agg[0].qty})`);

      // ---- #1: oversell guard — atomic conditional decrement (the reservation) ----
      const dec = await tx.ticketType.updateMany({
        where: { id: tt.id, remainingQty: { gte: dto.quantity } },
        data:  { remainingQty: { decrement: dto.quantity } },
      });
      if (dec.count === 0) throw new ConflictException('Sold out');

      // ---- create PENDING order (10-min hold) ----
      return tx.order.create({
        data: {
          userId,
          concertId: tt.concertId,
          status: 'PENDING',
          totalAmount: tt.price * dto.quantity,
          idempotencyKey,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          items: { create: [{ ticketTypeId: tt.id, quantity: dto.quantity, unitPrice: tt.price }] },
        },
        include: { items: true },
      });
    });

    // store the result so a duplicate key returns the SAME order
    await this.redis.set(`idemp:${idempotencyKey}`, JSON.stringify(order), 'EX', 86400);
    return order;
  } catch (e) {
    // genuine failure rolled back the whole TX → no order exists → free the key for a real retry
    await this.redis.del(`idemp:${idempotencyKey}`);
    throw e;
  }
}
```

**Pitfalls to check by hand (this is where AI code races):**
- The `FOR UPDATE` lock and the per-user count and the decrement **must be in the same `$transaction`**. If any sits outside, #6 races.
- `updateMany` with `remainingQty: { gte: qty }` is atomic — do **not** replace it with `findUnique` then `update` (that's the classic oversell race).
- The DB `@unique` on `Order.idempotencyKey` is your durable backstop if Redis is flushed. Keep it.

## A2. Payment confirm → issue tickets + QR (idempotent)

Payment itself is B's circuit-breaker-wrapped call to the mock gateway. On a **success callback/confirm**, flip the order and issue tickets — and make it safe against duplicate callbacks.

```ts
async confirmPayment(orderId: string) {
  return this.prisma.$transaction(async (tx) => {
    // conditional flip = idempotency guard: a duplicate callback flips 0 rows and skips re-issuing
    const flip = await tx.order.updateMany({
      where: { id: orderId, status: 'PENDING' },
      data:  { status: 'PAID' },
    });
    if (flip.count === 0) {
      return tx.order.findUnique({ where: { id: orderId }, include: { tickets: true } });
    }
    const items = await tx.orderItem.findMany({ where: { orderId } });
    for (const it of items) {
      for (let i = 0; i < it.quantity; i++) {
        await tx.ticket.create({
          data: { orderId, ticketTypeId: it.ticketTypeId, qrCode: randomUUID() },
        });
      }
    }
    return tx.order.findUnique({ where: { id: orderId }, include: { tickets: true } });
  });
  // after commit: emit "order.paid" event → B invalidates cache + fires notifications
}
```
On payment **failure/expiry**: a conditional flip `PENDING → FAILED/EXPIRED` and **add `remainingQty` back** (also via `updateMany` guarded by `status='PENDING'` so stock is released exactly once). The BullMQ expiry worker (B) does the same for abandoned carts.

## A3. Admin APIs
- Concert + ticket-type **CRUD** (`@Roles(ORGANIZER)`).
- **Revenue stats** endpoint: sum of `PAID` order totals per concert + tickets sold per type.
- **Sale-start enforcement** already handled in A1 (block before `saleStartsAt`).
- **Cancel concert:** set `CANCELLED`; emit event so B notifies buyers (refund-on-cancel is a Week-4 nice-to-have).

## A4. Load tests — *your mechanisms aren't "done" without these*

Put these in `scripts/load-test/`. Examples use **k6** (`brew install k6` / [k6.io](https://k6.io)). Run against a freshly seeded DB each time.

**`oversell.js` — fire more buyers than stock, expect sold ≤ stock:**
```js
import http from 'k6/http';
import { Counter } from 'k6/metrics';
const ok = new Counter('purchase_ok');
const soldout = new Counter('purchase_soldout');

export const options = { scenarios: { rush: {
  executor: 'shared-iterations', vus: 200, iterations: 500, // 500 buyers, stock e.g. 200
}}};

export default function () {
  const res = http.post('http://localhost:3000/orders',
    JSON.stringify({ ticketTypeId: __ENV.TT_ID, quantity: 1 }),
    { headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${__ENV.TOKEN}`,
        'Idempotency-Key': `${__VU}-${__ITER}`, // unique per attempt
    }});
  if (res.status === 201) ok.add(1);
  else if (res.status === 409) soldout.add(1);
}
```
**PASS = `purchase_ok` ≤ stock AND `remainingQty` in DB is exactly 0, never negative.** Query the DB after the run to confirm.

**`per-user-limit.js`** — same idea but **all iterations use one account** and one ticket type with `maxPerUser` set low; assert successes never exceed `maxPerUser`.

**`rate-limit.js`** (B's mechanism, but keep it here) — burst far above the bucket rate; assert a clear band of `429`s appears and legitimate slow traffic still gets `200`.

> Capture screenshots/logs of each passing run — you need them for the video.

---

# PERSON B — Protection mechanisms & async

Your week: **#2 rate limit → #3 circuit breaker → #7 caching → notifications + expiry worker.**

## B1. #2 Rate limiting — Token Bucket in Redis (atomic via Lua)

A guard that runs **one atomic Lua script** per key (per IP, or per user once authenticated). Atomicity matters — a read-modify-write in JS races under load.

`rate-limit.lua`:
```lua
-- KEYS[1] bucket key
-- ARGV: capacity, refillPerSec, nowMs, requested
local d = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(d[1])
local ts     = tonumber(d[2])
local cap    = tonumber(ARGV[1])
local rate   = tonumber(ARGV[2])
local now    = tonumber(ARGV[3])
local req    = tonumber(ARGV[4])
if tokens == nil then tokens = cap; ts = now end
tokens = math.min(cap, tokens + math.max(0, now - ts) / 1000 * rate)
local allowed = 0
if tokens >= req then tokens = tokens - req; allowed = 1 end
redis.call('HMSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', KEYS[1], math.ceil(cap / rate) * 2)
return allowed
```
NestJS guard: load the script (`redis.eval` / `evalsha`), key by `req.ip` or `userId`, return **429** when it returns `0`. Suggested demo config: `capacity=10, refill=5/sec`. Put a stricter bucket on the **purchase** endpoint than on browsing.

> Tier-1 upgrade (if time): a simple **waiting-room** — issue a queue token and admit in batches. plan.md flags this as the textbook answer to "80k + fairness + anti-bot". Optional; basic rate limiting satisfies the requirement.

## B2. #3 Circuit breaker (`opossum`) + graceful degradation

Wrap **only the payment-gateway call** so a failing gateway can't take the whole app down.
```ts
import CircuitBreaker from 'opossum';

const breaker = new CircuitBreaker(this.callGateway.bind(this), {
  timeout: 3000,                 // a call >3s counts as a failure
  errorThresholdPercentage: 50,  // open once half of calls fail
  resetTimeout: 10000,           // after 10s → HALF-OPEN (trial calls)
});
breaker.fallback(() => {
  throw new ServiceUnavailableException('Payment temporarily unavailable, please retry shortly');
});

// expose breaker.opened / .halfOpen / .closed for the observability demo
```
**Graceful degradation = the key demo point:** concert list/detail and e-ticket viewing have **no dependency** on the gateway, so when you toggle the mock gateway to `failure`, the breaker opens and payment fails fast **while browsing keeps working**. Make that contrast explicit on camera.

## B3. #7 Caching — cache-aside with active invalidation

```ts
async getConcertDetail(slug: string) {
  const key = `cache:concert:${slug}`;
  const hit = await this.redis.get(key);
  if (hit) return JSON.parse(hit);                 // cache hit → no DB
  const concert = await this.prisma.concert.findUnique({
    where: { slug }, include: { ticketTypes: true },
  });
  await this.redis.set(key, JSON.stringify(concert), 'EX', 60); // short-ish TTL
  return concert;
}
```
**TTL strategy:**
- Concert info (title/venue/bio) changes rarely → long TTL (5 min) is fine.
- `remainingQty` must look ~accurate → **invalidate on every successful purchase**: subscribe to A's `order.paid`/`order.created` event and `redis.del('cache:concert:'+slug)` (or update a separate short-TTL `remaining` key). Active invalidation is the part that proves you understand the requirement — don't skip it.

**Demo:** put load on the detail endpoint, show DB query count drop (log queries or use a counter), then buy a ticket and show `remaining` updates within one TTL/invalidation cycle.

## B4. Notifications (BullMQ) + reservation-expiry worker

- **Channel Strategy interface:** `NotificationChannel { send(payload) }` with `EmailChannel`, `InAppChannel` now; the point is a new channel (SMS/Zalo) drops in **without touching callers**. Document this as the answer to the spec's "extensible channels".
- On `order.paid`: enqueue a BullMQ job → send email (with e-ticket) + write an in-app notification row.
- **Expiry worker:** repeatable BullMQ job sweeps `Order` where `status='PENDING' AND expiresAt < now()` → conditional flip to `EXPIRED` → **add `remainingQty` back**. This is the other half of A's reservation model — use the **same release logic** (guarded `updateMany`) so stock is returned exactly once.
- **24h reminder** is a Week-3 task; just leave the cron scaffold here.

---

# PERSON C — Purchase UX, zone map, admin

Your week: **purchase flow UI → SVG zone map + live remaining → e-ticket QR → admin UI.**

## C1. Purchase flow
- Select ticket type + quantity → `POST /orders` with a generated **`Idempotency-Key`** header (e.g. a UUID per checkout attempt; reuse it if the user retries the same checkout). This is what makes A's #4a demo real from the UI.
- Redirect to the **mock gateway** page (B's service on :4000), then on return hit the confirm endpoint.
- On success → show the **e-ticket QR** (use `qrcode.react` or render the `qrCode` value).
- Handle the error states: sold out (409), per-user limit (400), payment unavailable (503 from the breaker).

## C2. Concert detail — interactive SVG zone map + real-time remaining
- Render the zones (GA/SVIP/VIP/CAT1/CAT2) as an interactive SVG; clicking a zone selects that ticket type.
- Show **remaining per type**, refreshed by polling `GET /concerts/:slug` every few seconds (it's cache-backed, so polling is cheap). Color zones by availability (e.g. grey when sold out).

## C3. Admin UI + in-app notifications
- ORGANIZER: CRUD forms for concerts/ticket types (name/price/qty/sale-start), cancel button, revenue dashboard reading A's stats endpoint.
- AUDIENCE: in-app notification list reading the `Notification` rows.

---

# Load-testing & honesty notes (read before the video)

- A mechanism is **green** only when its `scripts/load-test/*` passes on a **fresh seed**, run **more than once**. A single green run can hide a race.
- After `oversell.js`, always verify in the DB: `SELECT remainingQty FROM "TicketType" WHERE id=...` → must be `0`, never negative; PAID+reserved count must equal stock.
- Keep the **logs/screenshots** of each passing run for the demo.
- Be honest about tradeoffs on camera: the per-ticket-type row lock serializes buyers (correct, slightly lower throughput) — that's a deliberate, defensible choice.

---

# Day 12 acceptance gate (run together)

1. Fresh `docker-compose up` + seed → log in as AUDIENCE.
2. Buy a ticket end-to-end → mock gateway → **e-ticket QR appears**.
3. `oversell.js` → sold ≤ stock, remaining = 0, none negative. ✅
4. `per-user-limit.js` → account capped at `maxPerUser`. ✅
5. Resend a purchase with the **same Idempotency-Key** → one order, not two. ✅
6. `rate-limit.js` → burst gets fair 429s. ✅
7. Toggle mock gateway to fail → **browsing still works**, breaker opens, payment fails fast. ✅
8. Load the detail page repeatedly → DB query count drops (cache); buy → `remaining` updates. ✅

If 1–8 pass, mechanisms **#1, #2, #3, #4a, #6, #7** are demonstrable and Week 3 (offline check-in, CSV, AI bio) can start clean.

---

## Carry-over decisions to close this week
- **Reservation timeout/release** (A ↔ B): confirm 10-min hold + the worker uses A's exact release logic. Lock it Day 6.
- **`order.paid` event hook** (A → B): agree the event name/shape so B's cache-invalidation and notifications subscribe to the same thing. Lock it Day 7.
- **Check-in constraint shape** (A ↔ C): not needed until Week 3, but if C has slack, settle Option A vs B from the Week 1 guide now.
