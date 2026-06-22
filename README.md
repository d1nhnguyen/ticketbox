# TicketBox

A concert ticketing platform — NestJS + Prisma + PostgreSQL + Redis backend, React (Vite) web & scanner apps, and a mock payment gateway.

This README is a step-by-step tutorial for **running the app locally**.

---

## 1. Prerequisites

| Tool | Version | Notes |
| ---- | ------- | ----- |
| Docker Desktop | 24+ | Runs Postgres, Redis, backend, mock-gateway |
| Node.js | 20+ | Only needed to run the web / scanner frontends |
| npm | 9+ | Ships with Node |

> The backend, database, Redis, and mock payment gateway all run in Docker.
> The two frontends (web + scanner) run on your host with `npm run dev`.

---

## 2. Quick start (the whole backend in one command)

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

Verify it's up:

```bash
curl http://localhost:3000/concerts
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

## 4. Run the frontends

The web and scanner apps are **not** in Docker — run them on your host.

### Web app (audience + organizer)

```bash
cd src/web
npm install
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
npm install
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
| Web app | http://localhost:5173 | host (`npm run dev`) |
| Scanner app | http://localhost:5174 | host (`npm run dev`) |

Key public API endpoints:

- `GET /concerts` — list concerts
- `GET /concerts/:slug` — concert detail with ticket types
- `POST /auth/login` — returns `{ access_token }` (JWT with `{ sub, email, role }`)

---

## 6. Mock payment gateway

The gateway can simulate three outcomes, switchable live (used to demo the circuit breaker):

```bash
# Flip the mode at runtime
curl -X POST http://localhost:4000/admin/mode \
  -H "Content-Type: application/json" \
  -d '{"mode":"failure"}'   # "success" | "timeout" | "failure"
```

The default mode is set by `GATEWAY_MODE` in [docker-compose.yml](docker-compose.yml).

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

---

## 9. Running the backend without Docker (optional)

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

## 10. Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `GET /concerts` returns `[]` | Seed didn't run on a populated DB. Wipe and restart: `docker compose down -v && docker compose up -d --build`. |
| Backend exits with `Cannot find module dist/main.js` | Rebuild the image: `docker compose up -d --build backend`. |
| Web app shows "Không thể kết nối đến Backend" | Backend isn't up. Check `docker compose ps` and `docker compose logs backend`. |
| Port already in use (5432/6379/3000/4000) | Stop the conflicting local service, or change the host port mapping in `docker-compose.yml`. |
| Scanner won't start (port 5173 busy) | Run it on another port: `npm run dev -- --port 5174`. |

---

## 11. Project layout

```
ticketbox/
├─ docker-compose.yml        # postgres, redis, backend, mock-gateway
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
