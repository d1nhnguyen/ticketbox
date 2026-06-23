# Load Tests — TicketBox Mechanisms

These k6 scripts prove the graded concurrency mechanisms are correct under load, not just "ran once". Each script exits **0 (green)** only when all thresholds pass.

`circuit-breaker.js` is a sequential Node.js demo (run with `node`); the others require **k6**.

---

## Prerequisites

1. **Stack running** — postgres + redis + mock-gateway + backend:
   ```bash
   docker-compose up
   ```

2. **k6 installed:**
   - Windows: `winget install k6.k6` or `choco install k6`
   - macOS: `brew install k6`
   - Linux: see [k6.io/docs/get-started/installation](https://k6.io/docs/get-started/installation/)

3. **Fresh seed before each stock-consuming run:**
   ```bash
   # from src/backend (bash/linux/mac)
   FORCE_SEED=1 npm run seed

   # PowerShell
   $env:FORCE_SEED="1"; npm run seed
   ```
   Plain `npm run seed` is a no-op once the DB is seeded — you must force it.

---

## Run commands

```bash
# From the repo root
k6 run scripts/load-test/oversell.js
k6 run scripts/load-test/per-user-limit.js
k6 run scripts/load-test/rate-limit.js

# Node.js demo (no reseed needed, uses mock-gateway on :4000)
node scripts/load-test/circuit-breaker.js
```

Override defaults:
```bash
API_URL=http://localhost:3000 STOCK=50 k6 run scripts/load-test/oversell.js
API_URL=http://localhost:3000 MAX_PER_USER=4 k6 run scripts/load-test/per-user-limit.js
```

---

## What each test proves

### `oversell.js` — Mechanism #1 (Oversell prevention)

100 buyers compete for 50 SVIP tickets simultaneously.

| Metric | Threshold | Meaning |
|---|---|---|
| `purchase_ok` | `<= 50` | Never oversell |
| `final_remaining_qty` | `>= 0` | Stock never goes negative |

**Expected on a fresh seed:** `purchase_ok=50`, `purchase_soldout=50`, `final_remaining_qty=0`

### `per-user-limit.js` — Mechanism #6 (Per-user ticket limit)

One account fires 10 concurrent buy requests for VIP tickets (`maxPerUser=4`).

| Metric | Threshold | Meaning |
|---|---|---|
| `purchase_ok` | `<= 4` | Hard limit enforced even under concurrency |
| `limit_blocked` | `> 0` | The guard actually fires |

**Expected on a fresh seed:** `purchase_ok=4`, `limit_blocked=6`

### `rate-limit.js` — Mechanism #2 (Token Bucket rate limiting)

Two scenarios: burst (200 concurrent) then sustained (4 req/s for 5s, below the 10/s refill rate).

| Metric | Threshold | Meaning |
|---|---|---|
| `rate_limited` | `> 0` | Limiter rejects excess burst traffic |
| `passed_200` | `> 0` | Legit traffic still gets through |
| `sustained_429` | `== 0` | Slow traffic is never throttled |

No reseed needed — targets `GET /concerts` (public, read-only).

---

## Honest tradeoffs (state these in the video)

- **Per-ticket-type row lock** (`SELECT ... FOR UPDATE`) in the purchase transaction serializes all buyers of the same ticket type. This is **pessimistic locking** — it guarantees correctness at the cost of slightly lower raw throughput. This is a deliberate, defensible tradeoff.
- **Two devices scanning the same ticket offline** cannot be prevented in real time — only detected at sync. The server rejects the second scan on sync via the unique constraint. State this limitation explicitly; examiners reward correct understanding.

---

## Run twice, both green

A single green run can hide a race. Run `oversell.js` and `per-user-limit.js` at least twice (reseeding between runs) before marking them done.
