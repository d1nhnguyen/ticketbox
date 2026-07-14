# TicketBox — Gap Analysis (Requirements & Plan vs. Current Code)

> **Audited:** 2026-07-07 · **Baseline:** `develop` branch · **Sources checked:** `requirements.md`, `plan.md`, `blueprint/`, `docs/WEEK*.md`, `README.md`, full source tree, all local + remote git branches.
>
> **How to read this doc:** every requirement lands in exactly one of three buckets:
>
> | Bucket | Meaning | Action |
> |---|---|---|
> | ✅ **DONE (develop)** | Implemented and on the integration branch | Nothing (or minor polish) |
> | 🔀 **DONE, UNMERGED** | Implemented on a feature branch, **not** on `develop` | Merge + integrate |
> | ❌ **MISSING** | Exists nowhere in the repo | Build / write |

---

## 1. Executive summary

The backend core is in good shape: **six of the seven graded mechanisms (#1 oversell, #2 rate limiting, #3 circuit breaker, #4a idempotency, #6 per-user limit, #7 caching) are genuinely implemented on `develop`** — pessimistic `FOR UPDATE` + atomic conditional decrement, Lua token bucket, opossum breaker with 503 degradation, Redis `SET NX` idempotency with DB backstop, cache-aside with active invalidation — and each has a passing k6/node load-test script. #5 (CSV ingestion) is implemented minus scheduling.

The project's real problem is **fragmentation, not absence**. A large amount of "missing" work is finished but stranded on **six unmerged feature branches**: the entire check-in/sync backend, the AI Artist Bio module, the 24h reminder cron, the scanner PWA, the e-ticket QR display, the audience dashboard, and all admin upload UIs. On top of that, the scanner PWA and the check-in backend **have never been wired together** (the scanner still runs on `MOCK_API = true` with fabricated data).

### Top 5 grade-risk gaps

1. **`blueprint/proposal.md` is a 0-byte empty file.** A whole graded Part-1 artifact is absent. (§5.1)
2. **Mechanism #4b (offline double-scan) has no end-to-end proof.** Backend on `feat/checkin`, PWA on `feat/frontend-scaffold`, integration = 0%. This is one of the 7 graded mechanisms and the centerpiece of the video's offline demo. (§4)
3. **Six branches unmerged** — until merged, a grader cloning `develop` sees no check-in API, no AI bio, no scanner, no e-ticket QR, no admin forms. (§2)
4. **`design.md` is missing the two explicitly-graded prose sections**: overall architecture ("what are the parts, how do they talk") and failure isolation ("when part X fails, what happens to the rest"), plus a formal ADR section. (§5.2)
5. **Security bug that contradicts the "strict RBAC" requirement:** `POST /auth/register` accepts a client-supplied `role`, so anyone can self-register as `ORGANIZER` or `SCANNER`. (§3, row 8)

---

## 2. Branch integration map — the "hidden done work"

`develop` is the integration branch (`main` == `develop` today). Six branches carry finished work that never landed:

| Branch | Ahead of develop | Contains | Merge notes |
|---|---|---|---|
| `feat/checkin` (local + origin) | 3 commits | **Check-in backend**: `POST /checkin/sync` batch API (atomic `VALID→USED` flip via `updateMany` = server double-scan rejection; idempotent re-sync via `clientLogId` PK → `ALREADY_SYNCED`; append-only `CheckinLog` audit), scanner pre-download endpoints (valid tickets + guests per concert), guest-list verification endpoint | Clean add-on (new modules + `app.module.ts`). Merge early. |
| `feat/AI-artist-bio` | 1 commit | **Full AI-bio module**: `pdf-parse` text extraction → cleaning → provider-switchable AI call (Anthropic / Gemini / OpenAI via `AI_PROVIDER` env) → stores `artistBio`; adds `data/sample-pdf/sample-pdf.pdf`; `test-bio.js` script | Needs `ANTHROPIC_API_KEY` (or alt) documented in README/`.env.example`. |
| `feat/24h-concert-reminder` | 2 commits | **24h reminder**: `@Cron('*/15 * * * *')` scans concerts starting in [now+23h45, now+24h15], notifies PAID buyers once (dedup via `enqueueOnce`); debug controller | Supersedes the "no 24h reminder" gap. Includes the AI-bio commit (chain). |
| `feat/CSV-bio-upload-UI` | 6 commits | **Admin UIs**: AdminConcertDetail page (751 LOC), CSV guest-list upload UI, AI-bio PDF upload UI, create-concert wired to API; **OrderSuccess page with real QR render** (`qrcode.react` `QRCodeSVG`); **mock-gateway hosted `/pay` payment page** with idempotent charge replay | Chain: includes reminder + AI-bio commits. |
| `feat/audience-dashboard-UI` | 7 commits | Superset of the above chain **+ AudienceDashboard** (my-tickets with QR per ticket, transaction history, calls existing `GET /orders`), notifications controller additions | **Merge this one** to get the whole UI chain in one go. |
| `feat/frontend-scaffold` (newer commits than the already-merged ones) | 9 commits | **Scanner PWA**: `vite-plugin-pwa` manifest + SW, Dexie/IndexedDB (`validTickets`, `scanQueue`, `guests`), `html5-qrcode` ScannerTab with **local double-scan block**, VIPTab offline guest search + check-in, `syncEngine` with conflict events | ⚠️ Branched mid-chain — **lacks AudienceDashboard** and overlaps `audience-dashboard-UI` on `ConcertDetail.tsx`, `Notifications.tsx`, `Navbar.tsx`, `AdminConcertDetail.tsx`. ⚠️ Runs on `MOCK_API = true` + fabricated ticket/guest data — **not wired to the real backend**. |

**Recommended merge order into `develop`:**

1. `feat/checkin` (pure backend, no conflicts expected)
2. `feat/audience-dashboard-UI` (brings the whole UI + AI-bio + reminder chain)
3. `feat/frontend-scaffold` (scanner PWA; resolve the 4 overlapping web files in favour of `audience-dashboard-UI` versions, keep the `src/scanner/*` additions)
4. Then do the **scanner ↔ backend integration** work (§3 row 9 / §7 P0-1) — merging alone does not make offline check-in work.

---

## 3. Requirements coverage matrix (`requirements.md` §3)

| # | Requirement | Status | Details / remaining work |
|---|---|---|---|
| 1 | Concert list + detail (artist, venue) | ✅ DONE (develop) | `GET /concerts`, `GET /concerts/:slug` (cached); `Home.tsx`, `ConcertDetail.tsx`. |
| 2 | Interactive SVG seat map by zone (GA/SVIP/VIP/CAT1/CAT2) | ✅ DONE (develop) | Inline SVG in `ConcertDetail.tsx`: clickable zone rects, sold-out/selected states. Zone-level (per plan §0, per-seat explicitly avoided). Zones are data-driven from `ticketTypes` — seed data provides the 5 canonical tiers. **Gap:** seed has no `seatMapSvg` value; map relies on auto-layout fallback (acceptable, but see §6 seed note). |
| 3 | Real-time remaining per type | ✅ DONE (develop) | 5s polling of the cached detail endpoint; cache invalidated on purchase. |
| 4 | Select type/qty → pay (VNPAY/MoMo) → e-ticket QR | ✅ core / 🔀 QR display | Purchase (`POST /orders` + `Idempotency-Key`), redirect to mock gateway, `POST /orders/:id/confirm` issues `Ticket` rows with unique `qrCode` — DONE on develop. **E-ticket QR rendering (OrderSuccess + AudienceDashboard, `qrcode.react`) is only on the UI branches.** On develop a buyer never sees a QR. Backend `GET /orders` (with tickets) already exists on develop, so this is merge-only. |
| 5 | Per-account limit per type, across all paid orders, no multi-order bypass | ✅ DONE (develop) | Counted atomically inside the same `FOR UPDATE` transaction, PAID + live PENDING orders. k6-proven (`per-user-limit.js`). |
| 6 | Purchase confirmation via app + email with e-ticket | ⚠️ PARTIAL | In-app: DONE (`InAppChannel` persists `Notification` rows, web `Notifications.tsx` displays). **Email: `EmailChannel.send()` is a logger stub** — no mail is sent, no e-ticket attached. Requirement says "qua app **và email kèm e-ticket**". Minimum fix: real SMTP (e.g. nodemailer + mailhog container) or an honest documented limitation. |
| 7 | 24h pre-concert reminder | 🔀 UNMERGED | Fully implemented on `feat/24h-concert-reminder` (15-min cron + dedup). Nothing on develop (no `@Cron` anywhere). |
| 8 | Extensible notification channels (Zalo/SMS later) | ✅ DONE (develop) | `NotificationChannel` Strategy interface + Map dispatch + BullMQ queue. Adding a channel = one class. |
| 9 | Admin: create concert, configure types (name/price/qty/sale-start), update, cancel | ✅ API / 🔀 UI | APIs DONE on develop (`concerts.admin.controller.ts`, `ticket-types.controller.ts`, transactional cancel, revenue stats, DRAFT-only delete). **UI:** develop's admin Dashboard has a dead, unwired create form and no ticket-type config; the real forms (AdminConcertDetail, create wired to API, CSV & PDF upload) live on `feat/CSV-bio-upload-UI` / `audience-dashboard-UI`. |
| 10 | Cancel concert → notify buyers | ❌ **BUG (missing everywhere)** | `ConcertsService.cancel` emits `concert.cancelled` with buyer userIds, but **no `@OnEvent('concert.cancelled')` listener exists on any branch** — the only listener handles `order.paid`. Buyer cancellation notifications are silently dropped. Fix: add a listener in `notifications.listener.ts` (small). |
| 11 | Strict RBAC, 3 roles | ✅ / ❌ **security bug** | JWT + `RolesGuard` + `@Roles()` across controllers — real. **But `auth.register` trusts the client-supplied `role` field → anyone can self-register as ORGANIZER/SCANNER.** Fix: force `AUDIENCE` on public register (staff accounts via seed/admin only). Also web routing only protects `/admin`; `/notifications` unprotected. |
| 12 | Register (account creation) UI | ❌ MISSING | Backend `POST /auth/register` exists; **no register page in the web app** (login only, all roles come from seed). |
| 13 | Scanner mobile app scans QR | 🔀 UNMERGED | Scanner PWA on `feat/frontend-scaffold` (html5-qrcode, camera scan). Develop's `src/scanner` is a blank Vite scaffold; web `/scanner` route is a placeholder div. |
| 14 | Offline-first check-in + auto resync | 🔀 both halves / ❌ integration | Backend sync API on `feat/checkin`; PWA offline queue + SW on `feat/frontend-scaffold`. **Integration = 0%:** `syncEngine.ts` has `MOCK_API = true`, App.tsx loads fabricated tickets/guests instead of calling the real pre-download endpoints, no JWT/SCANNER auth on the scanner, `deviceId` is `'DEVICE_' + random` per scan (should be stable per device), VIPTab check-in never calls the real guest-verify endpoint. See §7 P0-1 for the full wiring checklist. |
| 15 | AI Artist Bio (PDF → AI → bio on detail page) | 🔀 UNMERGED | Full pipeline on `feat/AI-artist-bio` (pdf-parse + 3 providers). Upload UI on the UI branches. Develop: `artistBio` is a manually-set text field, `data/sample-pdf/` is empty. Verify the concert detail page actually renders `artistBio` after merge. |
| 16 | VIP guest list from nightly CSV, periodic import | ✅ core / ⚠️ scheduling | Upload endpoint + BullMQ processor with SHA-256 checksum dedup (`CsvImportBatch.checksum @unique`), per-row validation, in-file + DB dedup, `skipDuplicates` upsert, error counts, never crashes — DONE on develop with 3 sample CSVs + 4 test scripts. **Gap vs. wording:** requirements say "định kỳ nhập" (periodic, file arrives at night, no API) — current flow is admin-upload-triggered, not scheduled. Smallest honest fix: a cron that watches a drop folder (e.g. `data/inbox/`) **or** an ADR/spec note justifying upload-as-trigger. |
| 17 | Scanner verifies guest at VIP gate (offline) | 🔀 UNMERGED ×2 | Verification endpoint on `feat/checkin`; VIPTab offline search on `feat/frontend-scaffold` — not wired to each other (VIPTab's API call is commented out). |

---

## 4. Seven technical mechanisms scorecard (`requirements.md` §4, `plan.md` §2)

| # | Mechanism | Implementation status | Proof / demo status |
|---|---|---|---|
| 1 | Oversell / race on last ticket | ✅ REAL — `SELECT … FOR UPDATE` + atomic conditional decrement (`remainingQty ≥ qty`) in one TX (`orders.service.ts`) | ✅ `oversell.js` (k6): 50 stock / 200 buyers → exactly 50 ok, remaining ≥ 0 |
| 2 | Traffic spike 80k/5min | ✅ REAL — Lua token bucket in Redis, global `APP_GUARD`, per-route config, ip/user/ip+user keys, 429 + `Retry-After` | ✅ `rate-limit.js` (k6) |
| 3 | Payment gateway instability | ✅ REAL — opossum breaker (env-tunable thresholds), fallback → 503, order stays PENDING, browsing unaffected; `GET /payment/status` | ✅ `circuit-breaker.js` + mock-gateway mode toggle (`POST /admin/mode`) |
| 4a | No double charge | ✅ REAL — Redis `SET idemp:<key> NX EX 86400` + replay of stored result + `Order.idempotencyKey @unique` backstop; mock gateway also replays by key | ✅ covered in scripts + UI sends `crypto.randomUUID()` key |
| 4b | Offline double-scan | 🔀 SPLIT — server: atomic `VALID→USED` flip + `ALREADY_SYNCED` idempotent resync (`feat/checkin`); client: IndexedDB scanQueue dedup (`feat/frontend-scaffold`) | ❌ **No end-to-end proof.** Not merged, not integrated, **no check-in load/e2e test script** (only mechanism without one). The 2-devices-offline honesty note exists in `specs/checkin.md` ✅ |
| 5 | One-way CSV ingestion | ✅ REAL minus scheduling (see §3 row 16) | ✅ 4 upload test scripts + 3 sample CSVs (valid / errors / duplicates) |
| 6 | Per-user limit under load | ✅ REAL — aggregate inside the same locked TX, PAID + live PENDING | ✅ `per-user-limit.js` (k6): 10 concurrent → 4 ok / 6 blocked |
| 7 | Read-heavy caching | ✅ REAL — cache-aside (`getOrSet`), TTL 120s list / 60s detail, `invalidateConcert(slug)` on purchase | ✅ `caching.js`. Note: invalidation fires at **reservation** (order create), not payment confirm — defensible (stock changes at reserve), worth one sentence in design.md |

**Net:** 6/7 provable today on `develop`; #4b is the only mechanism a grader cannot currently see anywhere runnable.

---

## 5. Blueprint gaps (Part 1 — graded deliverable)

### 5.1 `blueprint/proposal.md` — ❌ EMPTY (0 bytes)

The single biggest documentation gap; flagged in `WEEK1_MISSING_TASKS.md` and never resolved. All five template sections must be written — **the source material already exists in `requirements.md`** (context §1, users §2, technical problems §4, the 80.000-users/5-min/70%-first-minute figure) plus the template skeleton in `requirements.md` lines 154–176:

- Vấn đề (why Zalo OA / Google Form / bank transfer fail; crashes, money-without-ticket, scalper bots)
- Mục tiêu (quantified: 80k/5min without collapse, zero oversell, no double charge, offline check-in)
- Người dùng và nhu cầu (3 groups)
- Phạm vi / ngoài phạm vi (mock gateway not real VNPAY, PWA not native, zone not per-seat, no production infra)
- Rủi ro và ràng buộc (the 7 technical problems)

### 5.2 `blueprint/design.md` — PARTIAL

Present and strong: real Mermaid C4 L1 + L2, request-flow/HLA diagram (includes offline path + integration points), ER diagram + design decisions, RBAC sequence diagram, all four protection-mechanism sections with implementation + why.

Missing:

1. **Overall-architecture prose section** ("Kiến trúc tổng thể") — the graded question "hệ thống gồm những phần nào, giao tiếp ra sao" is answered only by diagrams; add ~½ page: modular monolith choice + module list + communication (HTTP, events, BullMQ).
2. **Failure-isolation section** — explicitly graded ("khi một phần gặp sự cố thì các phần còn lại bị ảnh hưởng thế nào?"). Add a table: gateway down → breaker opens, browsing fine, orders PENDING; Redis down → ?; Postgres down → ?; mock-gateway timeout → breaker; worker down → queued jobs wait; scanner offline → IndexedDB queue.
3. **Formal ADR section** — currently 4 inline one-liners. Promote to numbered ADRs (Context/Decision/Consequences), and add the missing high-value ones: **SQL vs NoSQL**, **pessimistic (`FOR UPDATE`) vs optimistic locking** (the project's most defining decision — currently only in `specs/purchase.md`), JWT vs session, BullMQ vs Kafka/RabbitMQ, PWA vs native, modular monolith vs microservices. Plan §0 wanted every locked decision as an ADR.
4. Cosmetic: mechanism sections numbered 2, 3, 7, 4 (by mechanism ID) read out of order; mixed VN/EN.

### 5.3 `blueprint/specs/*.md`

| Spec | Status |
|---|---|
| `auth.md`, `purchase.md`, `checkin.md`, `admin.md` | ✅ COMPLETE — detailed, template-compliant (checkin.md is exemplary: option analysis + honest limitation) |
| `payment.md`, `csv-ingestion.md`, `notifications.md`, `ai-bio.md` | ⚠️ SKELETAL (~20–25 lines each) — all 5 headings present but thin; no diagrams, few error scenarios, minimal acceptance criteria. `ai-bio.md` is the thinnest. |
| Caching / rate-limiting / concerts read path | ❌ No standalone spec (covered only inside design.md). If the rubric reads "spec per feature", add a short `concerts-caching.md` (or fold into design.md and say so). |

Also: after merging branches, **re-verify specs match code** (e.g. csv-ingestion.md is thin on the NULL-`docId` dedup nuance the code actually handles).

---

## 6. Runnability & submission gaps (Part 2 + submission rules §7)

| Item | Status | Gap / action |
|---|---|---|
| `docker-compose.yml` | ⚠️ PARTIAL | postgres + redis + mock-gateway + backend only. **No `web`/`scanner` services** — frontends run via `npm run dev` on host. Either add the two services or state the host-run requirement prominently in README §2 (currently buried in §4). |
| Seed data | ✅ / ⚠️ | 4 canonical concerts × 5 tiers + 3 role accounts, idempotent, `FORCE_SEED=1`, flushes Redis. **Missing:** `seatMapSvg` values (requirement/plan list seat maps as part of seed), demo guest-list entries, a demo PAID order+tickets (useful for instantly demoing scanner + my-tickets without buying first). |
| README.md | ⚠️ PARTIAL | Excellent backend clone-and-run, accounts table, oversell walkthrough, gateway toggle, troubleshooting. **Missing run-books:** AI-bio env setup (`AI_PROVIDER`, `ANTHROPIC_API_KEY`, fallback behaviour), CSV import demo (3 sample files), offline check-in demo (how to simulate offline + resync + 2-device conflict), pointers to `per-user-limit.js` / `rate-limit.js` / `circuit-breaker.js` (only oversell is walked through; `scripts/load-test/README.md` exists but is never linked), frontend status caveat. Project-layout section lists only WEEK1 docs. |
| `scripts/demo/` | ❌ EMPTY | plan.md §4 promises `toggle-gateway-failure.sh` etc. Small effort, big video payoff. |
| Check-in e2e proof | ❌ MISSING | Only mechanism without a script (see §4). Add `scripts/load-test/checkin-double-scan.js`: sync same ticket from 2 "devices" → 1 ACCEPTED, 1 DUPLICATE; resend batch → ALREADY_SYNCED. |
| Video (`clips/`) | ❌ NOT STARTED | Script already exists in plan.md §6 (8 segments). Requires: 1080p, ~720 kbps, MP4, presenter camera on, live demo. |
| Drive folder + submission `.txt` | ❌ NOT STARTED | Public Drive: Blueprint (md folder or PDF) + `src/` + `data/` + `README.md` + `clips/`; `.txt` named `groupcode_mssv1_mssv2_mssv3.txt` containing the link. |
| Clean-machine dry run | ❌ NOT DONE | plan.md Phase 4 gate: fresh clone → `docker compose up` → seed → demo, on a machine that never built the project. |
| Web code health (small) | ⚠️ | Rules-of-Hooks bug in `Notifications.tsx` (`useEffect` after early `return <Navigate/>`); `http://localhost:3000` hardcoded in every page (no shared API client / env var); dead `src/web/src/data/mockConcerts.ts`; `/notifications` route unprotected. |

---

## 7. Prioritized action plan

Effort: **S** ≤ ½ day · **M** ≈ 1 day · **L** ≥ 2 days.

**Owners** follow `plan.md` §1 and the Week-3 rebalance (`WEEK3_GUIDE.md`): **A** = Backend Core (commerce, consistency, auth, check-in API, seed) · **B** = Backend Infra & Integrations (rate limit, breaker, caching, notifications, CSV, AI bio, docker/README) · **C** = Frontend & PWA Scanner. Note: the four skeletal specs and most doc gaps fall in B's areas — since A's core mechanisms are done and load-tested, A should absorb doc work where marked "(A can absorb)".

### P0 — grade-blocking (do first, in this order)

| # | Task | Where | Owner | Effort | Grading item |
|---|---|---|---|---|---|
| P0-1 | **Merge the six branches** per §2 order; resolve the 4 overlapping web files | git | **B** (lead) + A/C resolve conflicts in their areas | M | Everything in §2 becomes visible to the grader |
| P0-2 | **Wire scanner ↔ backend** (the only way #4b becomes demoable): flip `MOCK_API=false` in `syncEngine.ts`; replace mock data load in scanner `App.tsx` with the real pre-download endpoints from `feat/checkin`; add SCANNER login + JWT header; stable `deviceId` in `localStorage`; wire VIPTab to the guest-verify endpoint; env-based API URL | `src/scanner/src/*` | **C** + A (backend side, per plan §1 "verify 2-device scenario with C") | M–L | Mechanism #4b, offline video segment |
| P0-3 | **Write `blueprint/proposal.md`** (5 sections; source: requirements.md) | `blueprint/proposal.md` | **A** (was "whoever has slack" in Week 1 — that's why it's still empty; assign concretely) | S | Part-1 deliverable, currently 0 bytes |
| P0-4 | **design.md: add overall-architecture prose + failure-isolation table + formal ADR section** (≥6 ADRs incl. SQL-vs-NoSQL, pessimistic locking) | `blueprint/design.md` | **B** (failure isolation, infra ADRs) + **A** (locking & SQL-vs-NoSQL ADRs) | M | Part-1 items 1, 7, ADR |
| P0-5 | **Fix register role escalation** — force `AUDIENCE` on public register | `src/backend/src/auth/auth.service.ts` | **A** (owns auth) | S | "Strict RBAC" requirement |
| P0-6 | **Add `@OnEvent('concert.cancelled')` listener** → notify buyers | `src/backend/src/notifications/notifications.listener.ts` | **B** (owns notifications) | S | Cancel-concert requirement |
| P0-7 | **Check-in e2e proof script** (2-device duplicate + idempotent resync) | `scripts/load-test/checkin-double-scan.js` | **A** (owns check-in API) | S | #4b demo evidence |

### P1 — required for a complete submission

| # | Task | Where | Owner | Effort |
|---|---|---|---|---|
| P1-1 | README run-books: AI-bio env, CSV demo, offline check-in demo, link all load tests, frontend caveat, update layout section | `README.md` | **B** (owns docker/README) | S–M |
| P1-2 | Flesh out the 4 skeletal specs (payment, csv-ingestion, notifications, ai-bio) to the checkin.md standard; add caching/rate-limit spec or a pointer note | `blueprint/specs/` | **B** (all 4 are B's features; A can absorb payment.md — idempotency half is A's) | M |
| P1-3 | CSV scheduling: drop-folder cron **or** documented ADR that upload-trigger satisfies the one-way constraint | `guests/` or design.md | **B** (owns CSV ingestion) | S–M |
| P1-4 | Seed `seatMapSvg` for the 4 concerts + a demo guest list + one demo PAID order with tickets | `data/seed/`, `prisma/seed.ts` | **A** (owns schema/seed) | S–M |
| P1-5 | Email channel: mailhog/nodemailer integration **or** explicit documented limitation (requirement says email with e-ticket) | `notifications/channels/` | **B** (owns notifications) | S–M |
| P1-6 | Register page in web app | `src/web/src/pages/` | **C** (owns web UI) | S |
| P1-7 | Clean-machine dry run + re-run all load tests, capture screenshots/logs for the video | — | **All** (B leads the fresh `docker compose up`; A re-runs load tests; C checks both frontends) | M |

### P2 — polish (only if P0+P1 land)

- `scripts/demo/toggle-gateway-failure` helpers (**B**); shared web API client with env-based base URL (**C**); fix `Notifications.tsx` hooks bug (**C**); protect `/notifications` route (**C**); delete `mockConcerts.ts` (**C**); add web/scanner services to docker-compose (**B**); renumber design.md mechanism sections (**B**).

### Explicitly fine as-is (don't spend time)

- Zone-based (not per-seat) seating — locked decision, plan §0.
- Mock gateway instead of real VNPAY/MoMo — locked decision.
- Cache invalidation at reservation instead of payment — defensible; add one sentence to design.md.
- 2-devices-both-offline duplicate only detected at sync — already honestly documented in `specs/checkin.md`; keep the honesty note in the video.

---

## Appendix: verification commands used

```bash
git branch -a                                   # branch inventory
git rev-list --count develop..origin/<branch>   # ahead counts (checkin=3, audience-dashboard-UI=7, frontend-scaffold=9, ...)
wc -c blueprint/proposal.md                     # 0 bytes
grep -rn "@OnEvent" src/backend/src             # only 'order.paid' — no cancelled listener
git show origin/feat/frontend-scaffold:src/scanner/src/services/syncEngine.ts   # MOCK_API = true
git show origin/feat/audience-dashboard-UI:src/web/src/pages/OrderSuccess.tsx   # QRCodeSVG — QR render exists on branch
```

Load-test evidence for mechanisms #1/#2/#6 and docs for #3/#5/#7: `scripts/load-test/README.md`.
