# TicketBox

A concert ticketing platform — NestJS + Prisma + PostgreSQL + Redis backend, React (Vite) web & scanner apps, and a mock payment gateway.

This README is a step-by-step tutorial for **running the app locally**.

---

## 1. Prerequisites

| Tool | Version | Notes |
| ---- | ------- | ----- |
| Docker Desktop | 24+ | Runs the complete six-service stack |
| Node.js | 20+ | Optional; only needed for host development or load-test scripts |
| npm | 9+ | Optional; ships with Node.js |

> Docker Compose runs Postgres, Redis, backend, mock gateway, web, and scanner. No host-side dependency install is required for the standard demo.

---

## 2. Quick start (the complete stack)

From the repo root:

```bash
docker compose up -d --build
```

That's it. On a clean machine this will:

1. Start **Postgres** (`:5432`) and **Redis** (`:6379`) and wait until they're healthy.
2. Start the **mock payment gateway** (`:4000`).
3. Start the **backend** (`:3000`), which automatically:
   - applies Prisma migrations (`prisma migrate deploy`),
   - seeds 4 concerts + 3 test users (idempotent — skips if already seeded),
   - then boots the NestJS API.

The command also builds production images for the web app (`:5173`) and scanner PWA (`:5174`). Compose health checks gate startup of dependent services.

Verify the stack:

```bash
curl http://localhost:3000/concerts
curl http://localhost:3000/health
curl http://localhost:4000/health
```

You should get a JSON array of **4 concerts**. 🎉

### Watch the logs

```bash
docker compose logs -f backend
```

Look for `🌱 Seeding…`, `✅ Seed completed.`, and `Nest application successfully started`.

---

## 3. Seeded login accounts

The seed creates one user per role. Use these to log in via the web app:

| Role | Email | Password |
| ---- | ----- | -------- |
| Audience | `audience@ticketbox.dev` | `password123` |
| Organizer | `organizer@ticketbox.dev` | `password123` |
| Scanner | `scanner@ticketbox.dev` | `password123` |

---

## 4. Frontends

The default Compose stack serves the web app at **http://localhost:5173** and the scanner PWA at **http://localhost:5174**. For optional host development with hot reload, stop the corresponding Compose service and use the commands below.

### Web app (audience + organizer)

```bash
cd src/web
npm ci
npm run dev
```

Opens on **http://localhost:5173**. It talks to the backend at `http://localhost:3000`.

- Browse concerts at `/`
- Log in at `/login` (use the accounts above)
- Organizer logins land on `/admin`

### Scanner app

Run it on a different port so it doesn't collide with the web app:

```bash
cd src/scanner
npm ci
npm run dev -- --port 5174
```

Opens on **http://localhost:5174**.

---

## 5. Service map & ports

| Service | URL / Port | Runs in |
| ------- | ---------- | ------- |
| Backend API | http://localhost:3000 | Docker |
| Mock payment gateway | http://localhost:4000 | Docker |
| Postgres | localhost:5432 | Docker |
| Redis | localhost:6379 | Docker |
| Web app | http://localhost:5173 | Docker (Nginx static image) |
| Scanner app | http://localhost:5174 | Docker (Nginx static PWA image) |

Key public API endpoints:

- `GET /concerts` — list concerts
- `GET /concerts/:slug` — concert detail with ticket types
- `POST /auth/login` — returns `{ access_token }` (JWT with `{ sub, email, role }`)

---

## 6. Mock payment gateway

Mock payment is the default, fully working demo path. The browser opens the mock checkout page; successful confirmation returns to the web app, while the backend owns the `PENDING → PAID` transition, charge idempotency, and QR ticket issuance.

The gateway can simulate three outcomes, switchable live (used to demo the circuit breaker):

```bash
# Flip the mode at runtime
curl -X POST http://localhost:4000/admin/mode \
  -H "Content-Type: application/json" \
  -d '{"mode":"failure"}'   # "success" | "timeout" | "failure"
```

The default mode is set by `GATEWAY_MODE` in [docker-compose.yml](docker-compose.yml).

### Optional VNPay sandbox

VNPay is disabled by default. To enable it, set the complete backend configuration and rebuild:

```env
VNPAY_ENABLED=true
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_TMN_CODE=your_merchant_code
VNPAY_HASH_SECRET=your_hash_secret
VNPAY_RETURN_URL=http://localhost:5173/vnpay-return
```

The backend refuses to start if VNPay is enabled with missing values. The web UI reads `GET /payment/methods`, so VNPay controls remain hidden until the backend reports a complete configuration. MoMo and production payment processing are out of scope.

### CORS

The backend only accepts cross-origin requests from the origins listed in `CORS_ALLOWED_ORIGINS` (comma-separated). It defaults to `http://localhost:5173,http://localhost:5174` (the web and scanner dev/Docker origins) — update it if you serve either frontend from a different host.

### Demo/debug endpoints

`POST /payment/charge`, `POST /payment/reset`, and `POST /debug/reminders/trigger` are demo-only surfaces used by the load-test scripts, not part of the real purchase flow (the real flow calls the payment gateway in-process). They are disabled by default and always disabled when `NODE_ENV=production` (as in the Docker profile). To run them locally, set both in `src/backend/.env`:

```env
ENABLE_DEMO_ENDPOINTS=true
NODE_ENV=development
```

To run `scripts/load-test/circuit-breaker.js` or `scripts/load-test/test-reminder-cron.js` against the Docker stack, temporarily override the flag:

```bash
docker compose run -e ENABLE_DEMO_ENDPOINTS=true --rm backend
```

---

## 7. Common tasks

```bash
# Stop everything (keeps the database volume)
docker compose down

# Stop AND wipe the database (fresh seed on next up)
docker compose down -v

# Rebuild after backend code changes
docker compose up -d --build backend

# Force a fresh re-seed without wiping the volume
docker compose run --rm -e FORCE_SEED=1 --entrypoint sh backend \
  -c "npx prisma migrate deploy && npx ts-node --transpile-only prisma/seed.ts"
```

---

## 8. Load testing — oversell prevention

The purchase flow guards against overselling under concurrency (atomic conditional
decrement inside a row-locked transaction). [scripts/load-test/oversell.js](scripts/load-test/oversell.js)
proves it: it fires **100 concurrent** purchase requests at the `anh-trai-say-hi`
SVIP tier, which is seeded with only **50** tickets, and asserts that **exactly 50**
succeed, 50 get `409 Sold Out`, and stock never goes negative.

### Step 1 — reset the stock (required)

The test only means something when SVIP stock starts at its full **50**. Re-seeding
resets it, **but plain `npm run seed` is a no-op once the DB already has data** — the
seed has an idempotency guard. You must force it with `FORCE_SEED=1`:

```bash
# Backend running in Docker:
docker compose run --rm -e FORCE_SEED=1 --entrypoint sh backend \
  -c "npx prisma migrate deploy && npx ts-node --transpile-only prisma/seed.ts"

# Backend running on host (from src/backend):
FORCE_SEED=1 npm run seed
```

```powershell
# PowerShell (from src/backend):
$env:FORCE_SEED="1"; npm run seed
```

> ⚠️ `FORCE_SEED=1` **wipes all orders/tickets** and re-creates the demo data.

### Step 2 — run the test

```bash
node scripts/load-test/oversell.js
```

A genuine pass looks like this:

```
✅ Found SVIP ticket type: ... totalQty = 50, remainingQty = 50
  ✅ 201 Created (Success) : 50
  ⛔ 409 Conflict (Sold Out): 50
  Remaining stock : 0
🎉 OVERSELL PREVENTION TEST PASSED!
```

If you instead see it start from `remainingQty = 0` and pass with `0` sold, that's a
**false pass** — the stock wasn't reset. Re-run Step 1 with `FORCE_SEED=1`.

### 8.1 Other Load Tests
You can run the following test scripts similarly:
- **Rate Limit**: `node scripts/load-test/rate-limit.js`
- **Circuit Breaker**: `node scripts/load-test/circuit-breaker.js`
- **Per-User Limit**: `node scripts/load-test/per-user-limit.js`

---

## 9. AI Artist Bio Setup

To enable the AI Artist Bio feature:
1. Open `src/backend/.env`.
2. Set `AI_PROVIDER=gemini` (or `anthropic`, `openai`).
3. Set the corresponding API key, e.g., `GEMINI_API_KEY=your_key_here`.
4. If no key is set or the feature fails, the system safely falls back to a placeholder bio.

---

## 10. CSV Import Demo

To test the VIP Guest CSV upload:
1. Log in as **Organizer** (`organizer@ticketbox.dev`).
2. Go to the Admin Dashboard and select a Concert.
3. In the "Upload Khách mời (CSV)" tab, use the sample files in `src/backend/data/sample-csv/`:
   - `valid-guests.csv`: Imports successfully.
   - `duplicate-guests.csv`: Tests the checksum and duplicate rejection.
   - `invalid-format.csv`: Tests validation errors.

---

## 11. Offline Check-in Demo

To test the PWA Scanner's offline capability:
1. Open the Scanner app (`http://localhost:5174`) and log in as **Scanner**.
2. Go to the "Tải dữ liệu" tab and sync the latest tickets for a concert.
3. **Turn off your network** (in DevTools -> Network -> Offline).
4. Scan a ticket QR code (or use the VIP Search tab). The check-in will be recorded locally in IndexedDB.
5. Try scanning the same ticket again — you'll be blocked (Local Double-scan block).
6. **Turn the network back on**. The app will automatically sync the offline logs to the Backend.

---

## 12. Running the backend without Docker (optional)

If you prefer to run the API on your host (you still need Postgres + Redis from Docker):

```bash
docker compose up -d postgres redis mock-gateway   # infra only
cd src/backend
npm install
npx prisma migrate deploy
npm run seed
npm run start:dev
```

The host `.env` already points `DATABASE_URL` / `REDIS_URL` at `localhost`.

---

## 13. Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `GET /concerts` returns `[]` | Seed didn't run on a populated DB. Wipe and restart: `docker compose down -v && docker compose up -d --build`. |
| Backend exits with `Cannot find module dist/main.js` | Rebuild the image: `docker compose up -d --build backend`. |
| Web app shows "Không thể kết nối đến Backend" | Backend isn't up. Check `docker compose ps` and `docker compose logs backend`. |
| Port already in use (5432/6379/3000/4000) | Stop the conflicting local service, or change the host port mapping in `docker-compose.yml`. |
| Scanner won't start (port 5173 busy) | Run it on another port: `npm run dev -- --port 5174`. |

---

## 14. Project layout

```
ticketbox/
├─ docker-compose.yml        # complete six-service stack
├─ data/seed/                # seed data (concerts.json, users.json)
├─ src/
│  ├─ backend/               # NestJS API (Prisma, auth, concerts, payment)
│  │  └─ docker-entrypoint.sh  # migrate → seed → start
│  ├─ mock-gateway/          # Express mock payment gateway
│  ├─ web/                   # React (Vite) audience + organizer app
│  └─ scanner/               # React (Vite) scanner app
├─ blueprint/                # design docs + specs
└─ docs/                     # WEEK1_GUIDE.md, WEEK1_MISSING_TASKS.md
```
