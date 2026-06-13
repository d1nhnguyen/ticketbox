# TicketBox — Project Execution Plan

> **Team:** 3 members · **Timeline:** 3 weeks (Day 1–21) · **AI/Agents allowed.**
>
> Grading rewards: (1) a real Blueprint, (2) the **7 technical mechanisms implemented for real — not stubbed**, (3) a runnable demo with README + seed data, (4) the video. This plan is optimized for exactly that.

---

## 0. Strategy in one screen

We are NOT building a production system. We build a **focused MVP that genuinely implements all 7 technical problems** and can be demonstrated live.

**Locked decisions (write each into an ADR in `design.md`):**

| Decision | Choice | Why |
|---|---|---|
| Architecture | **Modular monolith** | 3 people, demos all 7 mechanisms, near-zero ops overhead |
| Backend | **NestJS (TypeScript)** | Built-in Guards → clean RBAC; modules → clean task split; ecosystem covers every mechanism |
| Primary DB | **PostgreSQL** | ACID + row locking → required for oversell / per-user limit / no-double-charge |
| Aux store | **Redis** | Rate limiting, cache-aside, idempotency keys (TTL), atomic inventory counters |
| Queue / async | **BullMQ** (Redis-backed) | Notifications, 24h reminders, async jobs — no Kafka/RabbitMQ ops |
| Payment | **Mock gateway service** (simulates success / timeout / failure) | Real VNPAY/MoMo is out of scope; mock is the tool to demo Circuit Breaker + Idempotency |
| Audience + Admin UI | **React (web)** | One stack, two apps |
| Check-in app | **React PWA** (IndexedDB + Service Worker), **NOT native** | Offline-first without native build/signing overhead |
| Seating | **Zone-based** (GA/SVIP/VIP/CAT1/CAT2) = ticket type + quantity, interactive SVG by zone | Avoids per-seat assignment complexity entirely |

> If nobody on the team knows NestJS, swap for the framework you know best (Spring Boot / FastAPI). Do **not** learn a new framework during these 3 weeks.

### How AI/Agents fit in (read this — it shapes the schedule)

AI agents make **scaffolding, CRUD, UI, boilerplate, and tests** extremely fast. That shifts the real bottleneck to the parts AI gets subtly wrong:

- **Delegate aggressively to AI:** project scaffold, DB migrations, basic CRUD, React pages/components, DTOs, Swagger, unit-test skeletons, README drafts, seed data.
- **Verify by hand, do NOT trust AI blindly:** the concurrency mechanisms (oversell, per-user limit, idempotency, offline double-scan) and circuit-breaker behavior. AI routinely produces code that *looks* correct but has a race. **These are the graded parts.** Each must be proven with a concurrency/load test (see `scripts/load-test/`), not just "it ran once."

Net effect: we front-load design, let AI build fast, and spend saved time on **verification + integration + demo prep**.

---

## 1. Roles & ownership

Names are placeholders — assign real names on Day 1.

### 👤 Person A — Backend Core (Commerce & Consistency)
Owns the money/inventory path and the data model.
- DB schema, migrations, **seed data** (source of truth for the team)
- Auth (JWT) + RBAC guards/decorators *(foundational — must land early, others depend on it)*
- Purchase flow end-to-end: reserve → pay → issue e-ticket (QR)
- **Mechanism #1** Oversell prevention (race condition)
- **Mechanism #6** Per-user ticket limit under load
- **Mechanism #4 (no-double-charge)** Idempotency keys
- Admin APIs: concert/ticket-type CRUD, revenue stats

### 👤 Person B — Backend Infra & Integrations
Owns cross-cutting protection + the one-way integrations.
- Repo scaffold, `docker-compose`, `.env`, config module
- **Mechanism #2** Rate limiting (Token Bucket) + simple waiting-room
- **Mechanism #7** Caching (cache-aside, TTL, active invalidation)
- **Mechanism #3** Circuit breaker + **mock payment gateway** + graceful degradation
- Notifications: extensible channel design (Strategy) + email + in-app + **24h reminder** (BullMQ + cron)
- **Mechanism #5** CSV guest-list ingestion (scheduled, error/dup-safe)
- AI Artist Bio (PDF parse → AI model → bio text)

### 👤 Person C — Frontend & PWA Scanner
Owns everything the user sees, plus offline check-in.
- Audience web: concert list, detail (SVG zone map + real-time remaining), purchase UI, e-ticket QR
- Admin web: CRUD UI + revenue dashboard
- **Mechanism (offline part of #4)** PWA scanner: IndexedDB, Service Worker, QR scan, **sync engine**, double-scan UX
- Scanner **VIP guest-list verification mode** (check a name/doc against the imported guest list at the VIP gate — also offline-capable)
- Auth UI + role-based routing (3 roles)

**Critical path / dependencies:**
1. A delivers **schema + auth** by end of Day 5 → unblocks B and C.
2. B delivers **mock gateway** before A finishes payment flow.
3. A delivers **e-ticket/QR + check-in API** before C's scanner sync works end-to-end.
4. Everyone writes their own `specs/*.md` during Week 1.

---

## 2. The 7 mechanisms → where & how to demo

This table is the project's spine. A feature is "done" only when its **Demo** column works.

| # | Problem | Implemented in | Technique | Demo (must be reproducible) |
|---|---|---|---|---|
| 1 | Oversell / race on last ticket | `orders/` | Atomic conditional `UPDATE ticket_types SET remaining = remaining - :q WHERE id=:id AND remaining >= :q` inside a TX (or Redis atomic DECR + reservation) | `scripts/load-test/oversell.js`: fire N>stock concurrent buys → sold ≤ stock, zero negative |
| 2 | Traffic spike (80k/5min) | `common/rate-limit` | Token Bucket in Redis per IP/user + lightweight queue | `rate-limit.js`: burst requests → excess get HTTP 429 fairly |
| 3 | Payment gateway unstable | `payment/` | Circuit Breaker (Closed/Open/Half-Open via `opossum`) + graceful degradation | Toggle `mock-gateway` to fail → breaker opens, browse/list still works, no full outage |
| 4a | No double charge | `orders/` | Idempotency-Key (Redis, TTL) — same key returns same result | Send same purchase twice (same key) → one charge, one order |
| 4b | Offline double-scan | `scanner/` + `checkin/` | 2-layer: local IndexedDB dedup + server unique constraint on `ticket_id` at sync | Scan one ticket twice on one device (blocked locally); scan same ticket on 2 devices offline → server accepts first only on sync |
| 5 | One-way CSV ingestion | `guests/` | Scheduled parser; per-row validation; checksum + upsert idempotency | Import valid/invalid/duplicate CSVs → bad rows logged, no crash, no dup guests |
| 6 | Per-user limit under load | `orders/` | Count PAID qty per (user, ticket_type) atomically in the same TX as the decrement | `per-user-limit.js`: concurrent buys from one account → never exceeds `max_per_user` |
| 7 | Read-heavy overload | `concerts/` + `common/cache` | Cache-aside (Redis): long TTL for concert info, short TTL / active invalidation for `remaining` | Hit list/detail under load → DB query count drops; remaining still ~accurate after a buy |

> **Honesty note for the video (scores points):** purely offline, two devices scanning the *same* ticket while *both* are offline cannot be prevented in real time — only detected at sync. State this limitation explicitly; examiners reward correct understanding over false "absolute safety" claims.

---

## 3. Core data model (Postgres)

A owns this; finalize on Day 2. Compact schema:

- **User**(id, email, password_hash, role[`AUDIENCE`|`ORGANIZER`|`SCANNER`], created_at)
- **Concert**(id, title, slug, venue, starts_at, status[`DRAFT`|`ON_SALE`|`CANCELLED`], artist_bio, bio_source_url, seat_map_svg)
- **TicketType**(id, concert_id, name, price, total_qty, **remaining_qty**, **max_per_user**, sale_starts_at)
- **Order**(id, user_id, concert_id, status[`PENDING`|`PAID`|`FAILED`|`EXPIRED`], total_amount, **idempotency_key**, created_at)
- **OrderItem**(id, order_id, ticket_type_id, quantity, unit_price)
- **Ticket**(id, order_id, ticket_type_id, qr_code UNIQUE, status[`VALID`|`USED`|`CANCELLED`], checked_in_at, checked_in_by)
- **CheckinLog**(id, ticket_id, device_id, scanned_at, sync_status) — drives offline dedup
- **GuestListEntry**(id, concert_id, full_name, doc_id, zone, source_batch_id, status)
- **CsvImportBatch**(id, filename, checksum UNIQUE, status, rows_total, rows_ok, rows_failed, created_at)
- **Notification**(id, user_id, channel, type, payload, status, sent_at)
- *(Redis, not a table)* `idemp:{key}` → order result, TTL ~24h · `rl:{id}` token buckets · `cache:concert:*`

Key constraints to add (these enforce correctness): `Ticket.qr_code` UNIQUE, partial unique to prevent a ticket being checked in twice, `CsvImportBatch.checksum` UNIQUE (skip re-importing same file).

---

## 4. Final deliverable structure

```text
ticketbox/
├── README.md                     # clone → run, no questions needed (graded)
├── docker-compose.yml            # postgres + redis + backend + web + scanner + mock-gateway
├── .env.example
│
├── blueprint/                    # PART 1 — design docs (OpenSpec layout)
│   ├── proposal.md               # context, problem, goals, scope, risks
│   ├── design.md                 # architecture, C4 L1/L2, HLA diagram, DB design, RBAC, 4 protection mechanisms, ADRs
│   └── specs/
│       ├── auth.md
│       ├── purchase.md           # buy flow + oversell + per-user limit
│       ├── payment.md            # circuit breaker + idempotency / no double charge
│       ├── checkin.md            # offline-first + sync + double-scan
│       ├── csv-ingestion.md
│       ├── notifications.md
│       └── ai-bio.md
│
├── src/                          # PART 2 — implementation
│   ├── backend/                  # NestJS
│   │   ├── src/
│   │   │   ├── main.ts  app.module.ts
│   │   │   ├── auth/              # JWT, RolesGuard, @Roles()
│   │   │   ├── users/
│   │   │   ├── concerts/         # CRUD + caching
│   │   │   ├── ticket-types/
│   │   │   ├── orders/           # purchase flow, race condition, per-user limit, idempotency
│   │   │   ├── payment/          # mock-gateway client + circuit breaker
│   │   │   ├── tickets/          # e-ticket, QR generation
│   │   │   ├── checkin/          # sync endpoint + double-scan guard
│   │   │   ├── notifications/    # channel Strategy, BullMQ producers/consumers, reminder cron
│   │   │   ├── guests/           # CSV cron + parser + validation
│   │   │   ├── ai-bio/           # PDF text extract + AI client
│   │   │   ├── common/           # rate-limit guard, cache module, interceptors, filters
│   │   │   └── config/
│   │   ├── prisma/               # schema.prisma + migrations   (or /migrations if TypeORM)
│   │   └── test/
│   │
│   ├── web/                      # React audience + admin
│   │   └── src/{pages,components,features/{concerts,purchase,admin,auth},api}/
│   │
│   ├── scanner/                  # React PWA (offline-first)
│   │   ├── public/manifest.json  service-worker
│   │   └── src/{db(IndexedDB),scan(QR),sync(engine),ui}/
│   │
│   └── mock-gateway/             # tiny payment simulator (toggle success/timeout/fail)
│
├── data/                         # seed + sample inputs
│   ├── seed/
│   │   ├── seed.ts               # runnable seed script
│   │   ├── concerts.json         # 4 concerts + ticket types + prices + seat maps
│   │   └── users.json            # sample audience / organizer / scanner accounts
│   ├── sample-csv/{guests-valid.csv, guests-with-errors.csv, guests-duplicates.csv}
│   └── sample-pdf/artist-presskit.pdf
│
├── scripts/
│   ├── load-test/{oversell.js, rate-limit.js, per-user-limit.js}   # k6 or artillery
│   └── demo/{toggle-gateway-failure.sh, ...}
│
└── clips/                        # final demo videos (or kept directly on Drive)
```

---

## 5. Phase-by-phase plan with checklists

Day numbers assume Day 1 = first working day. Adjust to your calendar.

### 🟦 PHASE 0 — Kickoff (Day 1)
- [ ] Assign A / B / C to real people; agree communication + daily 15-min standup
- [ ] Create Git repo, branch strategy (`main` + feature branches + PR review), shared Drive folder
- [ ] Lock the decisions in §0; create empty `blueprint/` skeleton files
- [ ] **A:** draft entity list + relationships (§3) for team review
- [ ] **B:** scaffold repo + `docker-compose` (postgres + redis empty boot OK) + `.env.example`
- [ ] **C:** scaffold `web/` and `scanner/` React apps (blank but running)

### 🟦 PHASE 1 — Blueprint + Walking Skeleton (Day 2–5)
Goal: design docs drafted **and** a system that boots, authenticates, and lists seeded concerts.

**Blueprint (parallel, everyone writes their area):**
- [ ] `proposal.md`: problem, goals (handle 80k/5min, no oversell), users, scope/out-of-scope, risks
- [ ] `design.md`: architecture style + **C4 L1 (System Context)** + **C4 L2 (Container)** + HLA diagram (use Mermaid in markdown) + DB design + RBAC model + 4 protection-mechanism sections + ≥3 ADRs (SQL vs NoSQL, monolith vs microservices, JWT vs session, BullMQ vs Kafka, PWA vs native)
- [ ] `specs/*.md`: each owner writes Description / Main flow / Error scenarios / Constraints / Acceptance criteria for their features

**Skeleton:**
- [ ] **A:** finalize migrations + `seed.ts` (4 concerts, ticket types, sample users for all 3 roles) + JWT auth + RBAC guard with `@Roles()` — **deliver by Day 5**
- [ ] **A:** concert read APIs (list + detail)
- [ ] **B:** mock-gateway service skeleton (endpoints to simulate ok/timeout/fail) + config + global exception filter
- [ ] **C:** auth UI (login per role) + role-based routing + concert list/detail pages wired to A's read APIs
- [ ] ✅ **Milestone:** `docker-compose up` → log in as each role → see seeded concerts. Blueprint ~80% drafted.

### 🟦 PHASE 2 — Core mechanisms + main features (Day 6–12)
Goal: a full paid purchase works and the consistency mechanisms are proven under concurrency.

**Person A:**
- [ ] Purchase flow: create PENDING order → call payment → on success issue tickets + QR
- [ ] **#1 Oversell:** atomic conditional decrement in TX
- [ ] **#6 Per-user limit:** count PAID qty per (user, type) in same TX
- [ ] **#4a Idempotency:** Idempotency-Key middleware (Redis + TTL)
- [ ] Write + run `oversell.js` and `per-user-limit.js` → **must pass** (no oversell, no limit breach)
- [ ] Admin: concert/ticket CRUD + revenue stats endpoint
- [ ] Enforce **sale-start time** (`sale_starts_at`) — block purchase before a ticket type opens; support **cancel concert** (mark CANCELLED + trigger notifications to buyers)

**Person B:**
- [ ] **#2 Rate limiting:** Token Bucket guard; verify with `rate-limit.js` (excess → 429)
- [ ] **#3 Circuit breaker** wrapping payment client; graceful degradation (browsing/listing unaffected when gateway down)
- [ ] **#7 Caching:** cache-aside for list/detail; TTL strategy; **invalidate `remaining` on successful purchase**
- [ ] Notifications: channel Strategy interface + email + in-app, fired on successful purchase (BullMQ)

**Person C:**
- [ ] Purchase UI: select type/qty, payment redirect (to mock-gateway), success → show **e-ticket QR**
- [ ] Concert detail: interactive **SVG zone map** + real-time remaining (poll or refetch)
- [ ] Admin UI: CRUD forms + revenue dashboard
- [ ] In-app notification display
- [ ] ✅ **Milestone:** end-to-end buy → e-ticket. Mechanisms #1, #2, #3, #4a, #6, #7 demonstrable.

### 🟦 PHASE 3 — Hard features + integration (Day 13–17)
Goal: offline check-in, CSV, AI bio done; everything wired together.

**Person C (the big one):**
- [ ] PWA: manifest + service worker (app shell cached, opens offline)
- [ ] Pre-download valid ticket list to **IndexedDB** for a concert
- [ ] QR scan (`html5-qrcode`); validate against local DB; mark used locally (**local double-scan blocked**)
- [ ] **Sync engine:** push CheckinLogs (each with unique id) when online; handle conflicts from server
- [ ] **VIP guest-list mode:** pre-download imported guest list to IndexedDB; verify guest by name/doc at VIP gate (offline-capable); mark guest checked-in + sync

**Person A:**
- [ ] Check-in API + sync endpoint; **server-side double-scan rejection** (unique constraint) returns clear conflict result
- [ ] Guest-list verification endpoint (lookup + mark guest checked-in) backing C's VIP mode
- [ ] Verify the 2-device-offline scenario end-to-end with C

**Person B:**
- [ ] **#5 CSV ingestion:** cron/scheduled import; per-row validation; checksum to skip re-imports; upsert to avoid dup guests; bad rows → error report, never crash
- [ ] **AI Artist Bio:** upload PDF → extract text → clean → call AI model → store bio on concert
- [ ] **24h reminder:** scheduled job emits reminder notifications
- [ ] ✅ **Milestone:** all 7 mechanisms + all features work; offline scan + sync verified; CSV + AI bio working.

### 🟦 PHASE 4 — Hardening, docs, video, submit (Day 18–21)
- [ ] Full integration pass: fresh `docker-compose up` + seed on a clean machine — **fix anything that needs a manual step**
- [ ] Re-run all `scripts/load-test/*` and capture results (screenshots/logs for the video)
- [ ] **README.md:** prerequisites, one-command start, seed instructions, test accounts, how to run each demo — graded, so make it bulletproof
- [ ] Finalize `blueprint/` (diagrams render, ADRs complete, specs match the code)
- [ ] **Record video** (1080p, ~720 kbps, MP4): each presenter on camera; walk through each technical problem + live demo on running code. Suggested script in §6
- [ ] Upload everything to public Drive folder per structure; set link sharing to "anyone with link"
- [ ] Create submission `.txt`: `groupcode_mssv1_mssv2_mssv3.txt` containing the public Drive link
- [ ] ✅ **Final review:** run the §7 submission checklist together before submitting

---

## 6. Video demo script (record in Phase 4)

Keep it tight, ~10–15 min, demo on the running app — no slides needed.
1. **Intro + architecture** (30s each presenter on camera): show C4 diagram from `design.md`.
2. **Oversell:** run `oversell.js` live → show "sold = stock, 0 oversell" in DB.
3. **Per-user limit:** run `per-user-limit.js` → account capped at `max_per_user`.
4. **Rate limiting:** burst requests → 429s.
5. **Payment instability:** toggle mock-gateway to fail → circuit opens, retries handled, **listing pages still work** (graceful degradation); idempotency → resubmit same key → one charge.
6. **Offline check-in:** turn off network in browser → scan QR → works; reconnect → syncs; then scan same ticket on a second device → server rejects on sync (state the offline limitation honestly).
7. **CSV + AI bio:** import the 3 sample CSVs (valid/errors/dups); upload a press-kit PDF → generated bio appears.
8. **Caching:** show DB query count / latency drop on cached reads.

---

## 7. Submission checklist (maps to spec §7)
- [ ] **Blueprint** present: either single `blueprint.pdf` **or** `blueprint/` folder (proposal + design + specs)
- [ ] **`src/`** complete; mechanisms are **real, not stubs**
- [ ] **`data/`** with seed script + 4 seeded concerts + sample CSV/PDF
- [ ] **`README.md`** lets a grader clone-and-run with no extra questions
- [ ] **`clips/`** video: 1080p, ~720 kbps, MP4, presenter camera on, live demo
- [ ] Drive folder is **public** (anyone with link)
- [ ] Submission file named `groupcode_mssv1_mssv2_mssv3.txt` containing the Drive link
- [ ] Did a clean-machine `docker-compose up` dry run before submitting

---

## 8. Risk register / common pitfalls
- **AI-generated concurrency code looks right but races.** Never ship #1/#4/#6 without passing the load-test scripts. This is the most common way teams lose the main points.
- **Auth/RBAC slips → blocks B and C.** A must land it by Day 5; treat as critical path.
- **PWA offline is the time sink.** It's allocated to Phase 3 first; if it slips, it eats your video time. Start the IndexedDB + service-worker spike early (even Day 10) if C has slack.
- **README left to the last hour.** Draft it in Phase 2 as features land; AI can keep it updated.
- **Caching that never invalidates** → stale `remaining`. The invalidation-on-purchase step is part of "done" for #7, not optional.
- **Scope creep on UI.** Grading is mechanism-driven; keep UI functional, not beautiful.
- **Trying microservices / Kafka / native app.** All explicitly avoided in §0 for a reason — don't reintroduce them.

---

## 9. Grading coverage — traceability matrix

Proof that this plan addresses **every requirement and grading rule in the spec**. Each row → where it lives in the deliverable.

### Spec §3 — System requirements
| Requirement | Where in deliverable |
|---|---|
| Concert list + artist info + venue | `concerts/` API, `web/` list & detail |
| **Interactive SVG seat map by zone** (GA/SVIP/VIP/CAT1/CAT2) | `web/` detail page (zone SVG) |
| **Real-time remaining** per ticket type | cached read + invalidation (#7); UI refetch |
| Select type/qty → pay (VNPAY/MoMo) → **e-ticket QR** | `orders/` + `payment/` (mock) + `tickets/` |
| **Max per account per type**, configured by BTC, across all paid orders | `TicketType.max_per_user` + #6 |
| Confirmation notification (app + **email with e-ticket**) | `notifications/` |
| **24h reminder** auto | reminder cron (BullMQ) |
| **Extensible notification channels** (Zalo/SMS later) | channel **Strategy** interface |
| Admin: create concert, **configure type (name/price/qty/sale-start)**, update, **cancel** | Admin APIs + UI; sale-start + cancel tasks (Phase 2) |
| **Strict RBAC, 3 roles** | `auth/` Guards + `@Roles()` |
| Scanner scans QR (mobile app) | `scanner/` PWA |
| **Offline-first** check-in + sync | IndexedDB + SW + sync engine |
| **AI Artist Bio** from uploaded PDF | `ai-bio/` |
| **VIP guest list from CSV**, scanner verifies guest at VIP gate | `guests/` ingestion + scanner VIP mode |

### Spec §4 — 7 technical problems
All covered — see §2 table (race condition, traffic spike incl. **bot/abuse mitigation + fairness**, payment instability, offline no-double-scan, one-way CSV, per-user limit, read-heavy caching). Each has a reproducible demo in `scripts/`.

### Spec §5 — Deliverables
| Required item | Where |
|---|---|
| **P1.1** Overall architecture doc (+ "what if a part fails") | `design.md` → architecture + failure-isolation note |
| **P1.2** C4 L1 + L2 | `design.md` (Mermaid) |
| **P1.3** High-Level Architecture Diagram (data flow, integration points, offline flow) | `design.md` |
| **P1.4** DB design (type + why + schema) | `design.md` + §3 here |
| **P1.5** ≥2 key business flows w/ error handling | `specs/purchase.md`, `checkin.md`, `csv-ingestion.md` |
| **P1.6** Access-control design (per endpoint / admin / scanner) | `specs/auth.md` + `design.md` RBAC |
| **P1.7** 4 protection mechanisms (rate limit / circuit breaker / idempotency / caching) — solution + principle + why | `design.md` protection sections |
| **P2** Full features, **real (non-stub)** mechanisms, README, **seed (4 concerts w/ types, prices, seat maps)** | `src/`, `data/seed/`, `README.md` |

### Spec §7 — Submission rules
| Rule | Handled in plan |
|---|---|
| Single `.txt` named `groupcode_mssvN...` with **public Drive link** | §7 checklist (use one MSSV per member) |
| Drive has Blueprint (PDF **or** `blueprint/` folder) | §4 structure |
| Drive has `src/` + `data/` + `README.md` | §4 structure |
| Video: screen recording of technical problems + **live demo** + **presenter camera on**, no slides | §6 script |
| Video specs: **1080p, ~720 kbps, MP4** | §7 checklist + Phase 4 |

> Before submitting, walk this matrix top-to-bottom as a final acceptance gate.

---

## 10. Advanced — if you finish early ("nice-to-have", do NOT start before §1–8 are solid)

Only touch these once core is **demoable and load-tests pass**. They raise the ceiling on the grade by showing depth, but a polished core beats a half-finished extra. Tiered by value-for-effort.

### Tier 1 — High impact, aligns directly with the spec's hard problems
- [ ] **Virtual waiting room / queue token system.** Beyond basic rate limiting: issue queue positions and admit users in controlled batches. This is the textbook answer to "80k in the first minute + fairness + anti-bot" and is genuinely impressive for ticketing. Demo: show users queued and admitted fairly.
- [ ] **Observability dashboard** (Prometheus + Grafana, or a simple `/metrics` page). Visualize **circuit-breaker state**, rate-limit rejections, cache hit-ratio, and oversell-attempts-blocked **live during the video**. Turns invisible mechanisms into visible proof — huge for the demo.
- [ ] **Multi-instance horizontal scaling demo.** Run 2 backend instances behind nginx in `docker-compose`. Proves the design is stateless and that Redis-backed state (rate limit / cache / idempotency / inventory) works across instances — directly supports the "handles 80k" claim. Strong ADR material.
- [ ] **Reservation with hold timer.** On checkout, reserve tickets for N minutes (Redis) and auto-release on timeout/abandon. More realistic than instant decrement and prevents inventory being locked by abandoned carts.

### Tier 2 — Engineering rigor (shows maturity)
- [ ] **Formal load-test report** simulating the real profile (80k over 5 min, 70% in minute 1) with k6 thresholds + charts; include in blueprint as evidence.
- [ ] **Transactional outbox** for reliable notification/payment-event delivery (no lost notifications if a worker dies). Pairs well with the idempotency story.
- [ ] **CI pipeline** (GitHub Actions): run lint + unit + the concurrency tests on every PR. Cheap, looks professional.
- [ ] **E2E tests** (Playwright) for the purchase and check-in happy paths.
- [ ] **Refund-on-cancel flow:** when BTC cancels a concert, auto-refund (mock) + notify all buyers. Closes the loop on the "cancel concert" requirement.

### Tier 3 — Polish & UX extras
- [ ] **Real-time remaining via SSE/WebSocket** instead of polling (event-driven UX; ties into notifications infra).
- [ ] **A second notification channel actually implemented** (e.g., Telegram bot or a mock SMS) — concretely proves the "extensible channels" claim instead of just asserting it.
- [ ] **Admin analytics:** sell-through per type, sales-over-time chart, revenue by concert.
- [ ] **Rate-limiter algorithm comparison** writeup: implement 2 of {Fixed Window, Sliding Window, Token Bucket, Leaky Bucket} and benchmark trade-offs — directly mirrors the spec's hint list and deepens the blueprint.
- [ ] **Security hardening pass:** helmet, strict CORS, input validation everywhere, brief threat-model note.

### Explicitly NOT worth your time (avoid the trap)
- ✗ **Per-seat assignment** (vs zones) — large complexity, no extra grading value.
- ✗ **Kubernetes / autoscaling** — ops rabbit hole; the multi-instance docker-compose already makes the scalability point.
- ✗ **Real VNPAY/MoMo integration** — out of scope; the mock gateway demonstrates the mechanisms better and safer.

> Rule of thumb: if an advanced item would risk the Phase 4 hardening/README/video window, **don't start it**. A clean, fully demoable core is the highest-scoring outcome.

