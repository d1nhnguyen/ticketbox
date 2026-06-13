# TicketBox — Week 1 Implementation Guide

> Goal by **Day 5**: `docker-compose up` → log in as each of the 3 roles → see the 4 seeded concerts.
> This guide tells each person exactly **how** to build their Week 1 issues. Follow it top-to-bottom.

**Stack reminder:** NestJS + Prisma + PostgreSQL + Redis · React (Vite) for web/scanner.

---

## Order of work (read first)

```
DAY 1  ── everyone starts in parallel, no one waits ──
  A: DB schema                B: mock gateway + config        C: scaffold web + scanner
DAY 2
  A: schema DONE (team review) → seed + auth begin
DAY 3                                                          C: scaffolds DONE → build UI on mock data
DAY 5  (hard deadline for the two blockers 🔴)
  A: auth DONE, read APIs DONE → C wires real auth + concert APIs
```

🔴 **Blockers (both A's):** `DB schema` and `JWT auth`. Until these land, C uses fake data.

---

# PERSON A — Backend Core

You are the critical path. Do these in order: **schema → auth → seed → read APIs**.

## A1. DB schema + Prisma migrations 🔴

### Setup

```bash
cd src/backend
npm install prisma @prisma/client
npx prisma init
```

Point `prisma/schema.prisma` at `DATABASE_URL` from `.env`.

### `schema.prisma` (full model — this is the team's source of truth)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  AUDIENCE
  ORGANIZER
  SCANNER
}

enum ConcertStatus {
  DRAFT
  ON_SALE
  CANCELLED
}

enum OrderStatus {
  PENDING
  PAID
  FAILED
  EXPIRED
}

enum TicketStatus {
  VALID
  USED
  CANCELLED
}

enum SyncStatus {
  PENDING   // logged offline, not yet sent to server
  SYNCED    // reached the server, pending validation
  ACCEPTED  // server confirmed this as the valid check-in (used in partial unique index)
  FAILED    // rejected by server (duplicate or invalid)
}

enum ImportStatus {
  PROCESSING
  SUCCESS
  FAILED
}

enum NotificationStatus {
  PENDING
  SENT
  FAILED
}

enum GuestStatus {
  INVITED
  CHECKED_IN
}

model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String
  role          Role     @default(AUDIENCE)
  createdAt     DateTime @default(now())

  orders         Order[]
  notifications  Notification[]
  scannedTickets Ticket[]       @relation("ScannerUser")
}

model Concert {
  id           String        @id @default(uuid())
  title        String
  slug         String        @unique
  venue        String
  startsAt     DateTime
  status       ConcertStatus @default(DRAFT)
  artistBio    String?       @db.Text
  bioSourceUrl String?
  seatMapSvg   String?       @db.Text
  createdAt    DateTime      @default(now())

  ticketTypes   TicketType[]
  orders        Order[]
  guests        GuestListEntry[]
  importBatches CsvImportBatch[]
}

model TicketType {
  id           String   @id @default(uuid())
  concertId    String
  name         String
  price        Int
  totalQty     Int
  remainingQty Int
  maxPerUser   Int
  saleStartsAt DateTime

  concert    Concert     @relation(fields: [concertId], references: [id], onDelete: Cascade)
  orderItems OrderItem[]
  tickets    Ticket[]

  @@index([concertId])
}

model Order {
  id             String      @id @default(uuid())
  userId         String
  concertId      String
  status         OrderStatus @default(PENDING)
  totalAmount    Int
  idempotencyKey String?     @unique
  expiresAt      DateTime?
  createdAt      DateTime    @default(now())

  user    User        @relation(fields: [userId], references: [id])
  concert Concert     @relation(fields: [concertId], references: [id])
  items   OrderItem[]
  tickets Ticket[]

  @@index([userId, concertId])
}

model OrderItem {
  id           String @id @default(uuid())
  orderId      String
  ticketTypeId String
  quantity     Int
  unitPrice    Int

  order      Order      @relation(fields: [orderId], references: [id], onDelete: Cascade)
  ticketType TicketType @relation(fields: [ticketTypeId], references: [id])

  @@index([orderId])
  @@index([ticketTypeId])
}

model Ticket {
  id           String       @id @default(uuid())
  orderId      String
  ticketTypeId String
  qrCode       String       @unique
  status       TicketStatus @default(VALID)
  checkedInAt  DateTime?
  checkedInBy  String?

  order       Order       @relation(fields: [orderId], references: [id])
  ticketType  TicketType  @relation(fields: [ticketTypeId], references: [id])
  scannerUser User?       @relation("ScannerUser", fields: [checkedInBy], references: [id])
  checkins    CheckinLog[]
}

model CheckinLog {
  id         String     @id @default(uuid())
  ticketId   String
  deviceId   String
  scannedAt  DateTime
  syncStatus SyncStatus @default(PENDING)

  ticket Ticket @relation(fields: [ticketId], references: [id])

  // partial unique (added via raw migration) blocks double check-in — see Option B below
  @@index([ticketId])
}

model GuestListEntry {
  id            String      @id @default(uuid())
  concertId     String
  fullName      String
  docId         String?     // NULL-safe dedup handled in application code — PostgreSQL treats NULLs as distinct in unique constraints
  zone          String
  sourceBatchId String
  status        GuestStatus @default(INVITED)

  concert Concert @relation(fields: [concertId], references: [id], onDelete: Cascade)

  @@unique([concertId, docId, sourceBatchId])
}

model CsvImportBatch {
  id         String       @id @default(uuid())
  concertId  String
  filename   String
  checksum   String       @unique
  status     ImportStatus @default(PROCESSING)
  rowsTotal  Int
  rowsOk     Int
  rowsFailed Int
  createdAt  DateTime     @default(now())

  concert Concert @relation(fields: [concertId], references: [id], onDelete: Cascade)
}

model Notification {
  id      String             @id @default(uuid())
  userId  String
  channel String
  type    String
  payload Json
  status  NotificationStatus @default(PENDING)
  sentAt  DateTime?

  user User @relation(fields: [userId], references: [id])
}
```

### The double check-in constraint — ⚠️ OPEN DECISION, settle with C this week

The server must reject a ticket being checked in twice. There are two clean ways; pick based on what C's offline sync pushes up, and document the choice in `specs/checkin.md`:

**Option A — unique on the Ticket flip (append-only audit log).**
Keep `CheckinLog` append-only (logs every scan attempt, including rejected duplicates, for audit) and guarantee a ticket can only flip to `USED` once:

```sql
CREATE UNIQUE INDEX one_checkin_per_ticket
  ON "Ticket" (id)
  WHERE status = 'USED';
```

**Option B — unique on the successful CheckinLog.**
If the log itself is the source of truth, put a partial unique on accepted check-ins only (so duplicate attempts can still be logged for audit). `ACCEPTED` is a distinct `SyncStatus` value meaning the server confirmed this scan as valid:

```sql
CREATE UNIQUE INDEX one_accepted_checkin_per_ticket
  ON "CheckinLog" ("ticketId")
  WHERE "syncStatus" = 'ACCEPTED';
```

> Do **not** use a plain `@@unique([ticketId])` on `CheckinLog` — it blocks logging rejected duplicate scans, which you want for the audit trail and the "2 devices offline" demo. Both options above leave that audit path open.
>
> **Decide this with C now**, because it defines how their sync engine reports a conflict back to the scanner UI (Week 3).

### Run + commit

```bash
npx prisma migrate dev --name init
git add prisma/ && git commit -m "feat(db): initial schema + migrations"
```

**Done when:** migrate runs clean on a fresh DB and the team has reviewed the model in standup.

### ⚠️ Decide now: the reservation (hold) model — settle with B

You must pick how `PENDING` interacts with stock _before_ building the purchase flow, because it shapes everything in Week 2. The model to write into `specs/purchase.md`:

- On "Buy", create a `PENDING` order and **decrement `remainingQty` immediately** (this is the reservation — it holds the seat while the user is on the payment page).
- Set `Order.expiresAt = now + 10 min`.
- A BullMQ worker (Person B) sweeps `PENDING` orders past `expiresAt` → mark `EXPIRED` → **add `remainingQty` back**.
- On successful payment → `PENDING` → `PAID`, issue tickets + QR. Stock stays decremented (already reserved).

This is why `expiresAt` is on the `Order` model. Talk to B today so the worker and the purchase flow agree on the timeout and the release logic.

---

## A2. JWT auth + RBAC 🔴

### Install

```bash
npm install @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt
npm install -D @types/passport-jwt @types/bcrypt
```

### Pieces to build

1. **AuthService** — `register()` (bcrypt hash), `login()` (verify + sign JWT with `{ sub, role }`).
2. **JwtStrategy** — validates token, attaches `{ userId, role }` to request.
3. **`@Roles()` decorator** + **RolesGuard**:

```ts
// roles.decorator.ts
export const Roles = (...roles: Role[]) => SetMetadata("roles", roles);

// roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>("roles", [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;
    const { user } = ctx.switchToHttp().getRequest();
    return required.includes(user.role);
  }
}
```

Usage on a protected endpoint:

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER)
@Post('concerts')
create() { /* ... */ }
```

### Prove it works (acceptance)

- Login as each role → returns a valid JWT.
- AUDIENCE token hitting an `@Roles(ORGANIZER)` endpoint → **403**.
- Write this up in `blueprint/specs/auth.md`.

---

## A3. Seed script

```bash
npm install -D ts-node
```

Add to `package.json`: `"seed": "ts-node ../../data/seed/seed.ts"` (adjust path).

`data/seed/seed.ts` logic:

1. Wipe tables (dev only).
2. Create 3 users with bcrypt-hashed passwords — one per role. **Document the plaintext passwords in README** so graders can log in.
3. Read `concerts.json`, create 4 concerts + their ticket types (set `remainingQty = totalQty`).

`data/seed/concerts.json` shape:

```json
[
  {
    "title": "Anh Trai Say Hi",
    "slug": "anh-trai-say-hi",
    "venue": "SVĐ Mỹ Đình, Hà Nội",
    "startsAt": "2026-08-15T19:00:00Z",
    "status": "ON_SALE",
    "ticketTypes": [
      {
        "name": "SVIP",
        "price": 5000000,
        "totalQty": 200,
        "maxPerUser": 2,
        "saleStartsAt": "2026-06-20T12:00:00Z"
      },
      {
        "name": "VIP",
        "price": 3000000,
        "totalQty": 1000,
        "maxPerUser": 4,
        "saleStartsAt": "2026-06-20T12:00:00Z"
      },
      {
        "name": "CAT1",
        "price": 2000000,
        "totalQty": 5000,
        "maxPerUser": 4,
        "saleStartsAt": "2026-06-20T12:00:00Z"
      },
      {
        "name": "CAT2",
        "price": 1200000,
        "totalQty": 8000,
        "maxPerUser": 6,
        "saleStartsAt": "2026-06-20T12:00:00Z"
      },
      {
        "name": "GA",
        "price": 800000,
        "totalQty": 15000,
        "maxPerUser": 6,
        "saleStartsAt": "2026-06-20T12:00:00Z"
      }
    ]
  }
]
```

Repeat for the other 3 concerts (Anh Trai Vượt Ngàn Chông Gai, Em Xinh Say Hi, Chị Đẹp Đạp Gió Rẽ Sóng).

**Done when:** fresh DB → `npm run seed` → 4 concerts + 3 test users exist.

---

## A4. Concert read APIs

- `GET /concerts` → list (id, title, slug, venue, startsAt, status).
- `GET /concerts/:slug` → detail incl. ticketTypes with `remainingQty` + `seatMapSvg`.
- These are **public** (no auth guard).
- Add `@nestjs/swagger` annotations so C and graders can read the contract.

**Done when:** returns seeded data; share the response shape with C so they can wire the frontend.

---

# PERSON B — Infra & Integrations

Both your Week 1 issues are **fully independent** — start Day 1, don't wait for A.

## B1. Mock payment gateway

Tiny standalone service in `src/mock-gateway/` (plain Express or a minimal Nest app).

- `POST /pay` → body `{ orderId, amount }`. Behaviour controlled by a mode flag:
  - `success` → returns `{ status: "success", txnId }` immediately.
  - `timeout` → waits longer than the caller's timeout, then responds (or never) → lets A/B demo circuit breaker.
  - `failure` → returns 500.
- Control the mode via env var `GATEWAY_MODE` **and** an admin toggle endpoint `POST /admin/mode` so you can flip it live during the video.
- Listen on port **4000**; add the service to `docker-compose.yml`.

**Done when:** you can force each of the 3 outcomes on demand.

## B2. Config + exception filter + docker wiring

- `@nestjs/config` global module reading `.env` (validate required vars on boot).
- Global `ValidationPipe` (`whitelist: true`, `transform: true`).
- Global exception filter → consistent error JSON `{ statusCode, message, error, path, timestamp }`.
- Once A's backend boots, add `backend` + `mock-gateway` services to `docker-compose.yml`. Use `depends_on` with the postgres/redis healthchecks so backend waits for the DB.

**Done when:** `docker-compose up` brings up postgres + redis + backend + mock-gateway, and a bad request returns the structured error.

> **Also this week:** start drafting your blueprint sections (rate limit / circuit breaker / idempotency / caching + ADRs). You implement them Week 2, but writing the design now makes coding faster.

---

# PERSON C — Frontend & PWA

Start Day 1. You don't have real APIs until ~Day 5, so **build against mock data first**, then swap.

## C1. Scaffold web + scanner

```bash
cd src
npm create vite@latest web -- --template react-ts
npm create vite@latest scanner -- --template react-ts
```

- Add a shared API client (axios/fetch wrapper) pointing at `http://localhost:3000`.
- Add React Router.
- Confirm both `npm run dev` and show a placeholder page.

**Done when:** both apps run and can hit the backend health endpoint.

## C2. Auth UI + role routing (wire to real auth ~Day 5)

- Login form → calls `POST /auth/login`, stores JWT (in memory + refresh strategy; avoid localStorage for tokens if you can, but it's acceptable for this project — note the tradeoff).
- Decode role from the token (or call `/auth/me`).
- Route guards: AUDIENCE → concert browsing, ORGANIZER → admin, SCANNER → scanner app.
- **Until A's auth lands:** stub the login to return a fake `{ role }` so you can build all 3 layouts.

## C3. Concert list + detail (wire to real API ~Day 5)

- List page → renders concerts (mock JSON now, `GET /concerts` later).
- Detail page → basic layout (the interactive SVG zone map is a **Week 2** task; just stub a placeholder this week).
- Loading + error states.

**Done when:** list renders from data; swapping mock → real API is a one-line change.

> **Tip:** copy A's `concerts.json` seed file as your mock data. When the real API lands, the shape already matches.

---

# Blueprint (everyone, in parallel — target ~80% by Day 5)

| File                                                                    | Owner             |
| ----------------------------------------------------------------------- | ----------------- |
| `proposal.md` (problem, goals, scope, risks)                            | whoever has slack |
| `design.md` → DB design + RBAC sections                                 | A                 |
| `design.md` → 4 protection mechanisms + ≥3 ADRs                         | B                 |
| `design.md` → C4 L1 + L2 + HLA diagram (Mermaid)                        | C                 |
| `specs/auth.md`, `specs/purchase.md`                                    | A                 |
| `specs/payment.md`, `csv-ingestion.md`, `notifications.md`, `ai-bio.md` | B                 |
| `specs/checkin.md`                                                      | C                 |

Each spec must have: **Description / Main flow / Error scenarios / Constraints / Acceptance criteria.**
Use Mermaid for diagrams so they render natively on GitHub.

---

# Day 5 acceptance gate (run this together)

1. `docker-compose up` on a clean checkout — comes up with no manual steps.
2. `npm run seed` — 4 concerts appear.
3. Log in via the web app as AUDIENCE, ORGANIZER, SCANNER — each lands on the right area.
4. Concert list + detail render from the live API.
5. Blueprint diagrams render on GitHub; specs drafted.

If all 5 pass, Week 1 is done and Week 2 (the graded concurrency mechanisms) can start clean.
