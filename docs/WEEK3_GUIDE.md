# TicketBox — Week 3 (Final Week) Implementation Guide

> Covers **Day 13–21** (plan.md Phase 3 + Phase 4).
> Goal by **Day 17**: offline check-in + sync, CSV guest ingestion, and AI Artist Bio all work; the **2-device-offline double-scan** scenario is verified end-to-end.
> Goal by **Day 21**: clean-machine `docker-compose up`, bulletproof README, all load tests re-run with captured evidence, **video recorded**, Drive uploaded, submission `.txt` created.

**Stack reminder:** NestJS + Prisma + PostgreSQL + Redis + BullMQ · React PWA (IndexedDB + Service Worker) · `html5-qrcode` · `pdf-parse` (or `pdfjs`) · Anthropic API for the AI bio.

> ⚠️ **Read this first.** This week splits into two halves: **Day 13–17 = the last hard features** (offline is the time sink — plan.md §8), **Day 18–21 = hardening + video + submit, no new features**. If a feature slips, it eats your video window. Protect the last 3 days.

---

## ⚠️ Reality check before you start (status correction — June 2026)

This guide originally assumed **Week-2 Person-C frontend was done**. It is **not**. Current repo state:

- **`src/web`** — only a Week-1-level scaffold: login + role routing + concert list/detail on **mock data** (`src/web/src/data/mockConcerts.ts`). **Missing:** real API wiring, purchase flow UI, interactive SVG zone map, e-ticket QR screen, admin CRUD forms, in-app notifications, AI-bio display. (No `qrcode` dep yet.)
- **`src/scanner`** — bare Vite scaffold (default `App.tsx`; deps are only `react`/`react-dom` — no `dexie`, `html5-qrcode`, or service worker). **All** of Week-3 Person-C work is greenfield.
- The **backend (A + B) is essentially complete and load-test-proven** (oversell / per-user-limit / no-double-charge verified under concurrency). The bottleneck is now **entirely on the frontend**.

**Consequence:** Person C owes *both* the unfinished Week-2 web **and** the Week-3 scanner — too much for one person in the final week. **Rebalance now.** Treat the audience/admin web as a **hard prerequisite for the video**: `buy → e-ticket`, `remaining updates`, and the admin dashboard demos cannot be shown without it. If the web truly can't land, the fallback is to demo those flows via Swagger/curl and **say so on camera** — but a working web is worth far more points.

### Revised ownership for the final week
- **Person C → scanner PWA** (C1–C4) only — it's the hardest offline work, keep it focused.
- **Person A and B pick up the audience+admin web** (new **CARRY-OVER** section below), since their backend is done. Suggested split: one takes **CW1+CW2+CW3** (wire APIs + purchase/e-ticket + SVG map), the other takes **CW4** (admin CRUD + revenue dashboard + AI-bio upload UI + in-app notifications).

---

## Order of work & dependencies

```
PREREQ (Week 2): backend purchase→e-ticket+QR API works · all 6 Week-2 mechanisms pass load tests
                 ⚠️ src/web is NOT done (mock data only) · src/scanner is an empty scaffold — see Reality check above
                 check-in constraint decision (Option A vs B) — SETTLE on Day 13 if not already

  (A/B backend is largely done → A/B also own the CARRY-OVER web; C is scanner-only)
DAY 13 ── parallel ──
  A: check-in+sync API + CW1 web (wire real APIs/auth)   B: #5 CSV + CW1 web   C: PWA shell (manifest + SW, opens offline)
DAY 14-15
  A: server double-scan reject + CW2 buy→e-ticket QR     B: AI Artist Bio + CW4 admin   C: IndexedDB + QR scan + local dedup
DAY 16
  A: guest-verify endpoint + CW3 SVG map/remaining       B: 24h reminder cron + CW4 AI-bio UI + in-app notif   C: sync engine + VIP guest mode
DAY 17  ✅ 2-device-offline verified (A+C); CSV + AI bio working (B); web buy→e-ticket + admin work (carry-over); ALL features land
─────────────────────────────────────────────────────────────────────────────────────────
DAY 18  full integration pass on a CLEAN machine — fix anything needing a manual step
DAY 19  re-run every load test, capture evidence; finalize blueprint (diagrams + ADRs + specs match code)
DAY 20  record video (1080p, ~720kbps, MP4, camera on, live demo)
DAY 21  upload to public Drive; create submission .txt; walk the §7 matrix; submit
```

**Hard dependencies:**
1. **Check-in constraint shape (A ↔ C):** lock Option A vs B (Week 1 guide) on **Day 13** — it defines how the sync engine reports a conflict to the scanner UI.
2. A's **sync endpoint** must land before C's sync engine works end-to-end → target Day 15.
3. A's **guest-verify endpoint** backs C's **VIP mode** → both target Day 16.
4. B's **CSV ingestion** populates `GuestListEntry` → C pre-downloads that list for VIP mode → B finishes import by Day 15 so C has real data.

---

## What ships this week

| # | Feature / mechanism | Owner | Where | "Done" = |
|---|---|---|---|---|
| 4b | Offline double-scan prevention | A + C | `scanner/` + `checkin/` | scan same ticket twice on one device → blocked locally; same ticket on 2 offline devices → **server accepts first only on sync** |
| — | Offline-first check-in + sync engine | C | `scanner/` | network off → scan works → reconnect → syncs; conflicts surfaced in UI |
| — | VIP guest-list verification mode | C + A | `scanner/` + `guests/` | verify guest by name/doc at VIP gate (offline-capable) → mark checked-in → sync |
| 5 | One-way CSV ingestion | B | `guests/` | import valid / invalid / duplicate CSVs → bad rows logged, no crash, no dup guests, re-import skipped |
| — | AI Artist Bio | B | `ai-bio/` | upload press-kit PDF → extract → clean → AI → bio stored + shown on concert detail |
| — | 24h reminder | B | `notifications/` | scheduled job emits reminder notifications before a concert |
| ⚠️ | **Audience + admin web** (carry-over from Week 2, was unfinished) | A/B (see Reality check) | `web/` | browse on real API → **buy → e-ticket QR in browser**; admin CRUD + revenue dashboard; SVG zone map; AI-bio + in-app notifications shown |

> **Honesty note for the video (scores points):** two devices *both offline* scanning the *same* ticket **cannot** be prevented in real time — only **detected at sync**. State this explicitly; examiners reward correct understanding over false "absolute safety" claims (plan.md §2).

---

# PERSON A — Check-in server side & guest verification

Your week, in order: **check-in/sync API → server double-scan rejection → guest-verify endpoint → verify the 2-device scenario with C.**

## A1. Settle the double check-in constraint (Day 13, with C)

Pick **Option A or B** from the Week 1 guide and write it into `specs/checkin.md`. Recommended: **Option A** (unique on the `Ticket` flip to `USED`) — the `CheckinLog` stays an append-only audit of every scan attempt (including rejected duplicates, which you need for the 2-device demo).

```sql
-- raw migration
CREATE UNIQUE INDEX one_checkin_per_ticket
  ON "Ticket" (id) WHERE status = 'USED';
```

> Do **not** use a plain `@@unique([ticketId])` on `CheckinLog` — it blocks logging rejected duplicate scans, which is exactly the audit trail the demo needs.

## A2. Sync endpoint (batch, idempotent per scan)

The scanner pushes a **batch** of locally-recorded scans. Each scan carries a client-generated unique `id` so re-sending the same batch is safe.

```ts
// checkin/checkin.service.ts
async syncBatch(scannerId: string, scans: ScanDto[]) {
  const results: SyncResult[] = [];
  for (const s of scans) {
    try {
      const r = await this.prisma.$transaction(async (tx) => {
        // conditional flip = the double-scan guard: VALID → USED flips 0 rows if already used
        const flip = await tx.ticket.updateMany({
          where: { id: s.ticketId, status: 'VALID' },
          data:  { status: 'USED', checkedInAt: s.scannedAt, checkedInBy: scannerId },
        });
        // append-only audit log — record EVERY attempt, accepted or not
        await tx.checkinLog.create({
          data: {
            id: s.clientLogId,            // client-generated → idempotent re-sync
            ticketId: s.ticketId,
            deviceId: s.deviceId,
            scannedAt: s.scannedAt,
            syncStatus: flip.count === 1 ? 'ACCEPTED' : 'FAILED',
          },
        });
        return flip.count === 1 ? 'ACCEPTED' : 'DUPLICATE';
      });
      results.push({ ticketId: s.ticketId, clientLogId: s.clientLogId, result: r });
    } catch (e) {
      // a re-sent clientLogId hits the PK and is already recorded → treat as idempotent success
      results.push({ ticketId: s.ticketId, clientLogId: s.clientLogId, result: 'ALREADY_SYNCED' });
    }
  }
  return results; // C reconciles each clientLogId against this
}
```

**Why this is correct:** the `VALID → USED` conditional flip is atomic. First device to sync a given ticket flips it; the second device's scan flips **0 rows** → returns `DUPLICATE`, and C shows a conflict. The append-only log preserves both attempts for audit.

`POST /checkin/sync` → `@Roles(SCANNER)`, body `{ scans: ScanDto[] }`, returns the per-scan result array.

## A3. Pre-download (warm) endpoints for the scanner

So a device can validate offline, it downloads the valid set **before** going offline:

- `GET /concerts/:id/tickets/valid` → `@Roles(SCANNER)` → minimal list `{ ticketId, qrCode }` of `VALID` tickets for that concert (C stores in IndexedDB).
- `GET /concerts/:id/guests` → `@Roles(SCANNER)` → guest list for VIP mode (backs A4).

## A4. Guest-list verification endpoint (backs C's VIP mode)

```ts
// guests/guests.controller.ts  — @Roles(SCANNER)
@Post('verify')
async verify(@Body() dto: { concertId: string; fullName?: string; docId?: string }) {
  // lookup by docId first (stronger), fall back to fullName match
  const guest = await this.svc.findGuest(dto);
  if (!guest) return { found: false };
  return { found: true, guest: { id: guest.id, fullName: guest.fullName, zone: guest.zone, status: guest.status } };
}

@Post('check-in')
async checkIn(@Body() dto: { guestId: string }) {
  // conditional flip INVITED → CHECKED_IN: idempotent, blocks double entry
  const flip = await this.svc.markCheckedIn(dto.guestId); // updateMany WHERE status='INVITED'
  return { ok: flip.count === 1, alreadyCheckedIn: flip.count === 0 };
}
```

## A5. Verify the 2-device-offline scenario end-to-end (with C, Day 17)

Sit with C and run it for real: one ticket, two devices both offline, each scans it, both reconnect.
**Expect:** server `ACCEPTED` for the first device to sync, `DUPLICATE` for the second; `Ticket.status = USED` exactly once; both attempts present in `CheckinLog`. Capture this for the video.

---

# PERSON B — CSV ingestion, AI bio, 24h reminder

Your week: **#5 CSV ingestion → AI Artist Bio → 24h reminder cron.** All three are independent of A and C — no blockers.

## B1. #5 CSV guest-list ingestion (scheduled, error/dup-safe)

The brand sends a CSV overnight; there is **no API** to call. Pull files from a watched folder (e.g. `data/incoming-csv/`) on a schedule.

```ts
// guests/csv-import.service.ts
@Cron('0 2 * * *') // 02:00 nightly; also expose a manual trigger for the demo
async importPending() {
  for (const file of this.listIncoming()) {
    const checksum = sha256(readFileSync(file));

    // skip re-importing the SAME file (checksum UNIQUE on CsvImportBatch)
    if (await this.prisma.csvImportBatch.findUnique({ where: { checksum } })) {
      this.log.warn(`Skipping already-imported ${basename(file)}`);
      continue;
    }

    const batch = await this.prisma.csvImportBatch.create({
      data: { concertId: this.resolveConcert(file), filename: basename(file),
              checksum, status: 'PROCESSING', rowsTotal: 0, rowsOk: 0, rowsFailed: 0 },
    });

    let ok = 0, failed = 0, total = 0;
    const errors: string[] = [];
    for (const row of parseCsv(file)) {       // stream rows
      total++;
      const v = validateRow(row);             // required fields, zone whitelist, etc.
      if (!v.valid) { failed++; errors.push(`row ${total}: ${v.reason}`); continue; }
      try {
        // upsert on (concertId, docId, sourceBatchId) → no dup guests
        await this.prisma.guestListEntry.upsert({
          where: { concertId_docId_sourceBatchId: {
            concertId: batch.concertId, docId: v.docId, sourceBatchId: batch.id } },
          create: { ...v.data, sourceBatchId: batch.id },
          update: { ...v.data },
        });
        ok++;
      } catch (e) { failed++; errors.push(`row ${total}: ${e.message}`); }
    }

    await this.prisma.csvImportBatch.update({
      where: { id: batch.id },
      data: { status: failed === total ? 'FAILED' : 'SUCCESS',
              rowsTotal: total, rowsOk: ok, rowsFailed: failed },
    });
    if (errors.length) this.writeErrorReport(batch.id, errors); // never crash — log + continue
  }
}
```

**Hardening checklist (this is what's graded):**
- A malformed row **never** aborts the batch — it's counted, logged, and skipped.
- **Checksum** on the whole file → re-importing the same file is a no-op.
- **Upsert** on `(concertId, docId, sourceBatchId)` → re-running never duplicates a guest. (`docId` NULL handling: PostgreSQL treats NULLs as distinct, so dedup rows with NULL `docId` in app code by `fullName` — note this in `specs/csv-ingestion.md`.)
- Provide the 3 demo files: `data/sample-csv/{guests-valid.csv, guests-with-errors.csv, guests-duplicates.csv}`.
- Expose a manual trigger (`POST /admin/guests/import`) so you can run it live on camera.

## B2. AI Artist Bio (PDF → AI → stored bio)

```ts
// ai-bio/ai-bio.service.ts
async generateBio(concertId: string, pdf: Buffer) {
  const raw = (await pdfParse(pdf)).text;          // pdf-parse / pdfjs
  const clean = raw.replace(/\s+/g, ' ').slice(0, 8000).trim(); // strip whitespace, cap length

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json',
               'x-api-key': process.env.ANTHROPIC_API_KEY,
               'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user',
        content: `Viết một đoạn giới thiệu nghệ sĩ ngắn gọn (3-4 câu) từ press kit sau:\n\n${clean}` }],
    }),
  });
  const data = await res.json();
  const bio = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

  await this.prisma.concert.update({ where: { id: concertId }, data: { artistBio: bio } });
  return bio;
}
```

`POST /concerts/:id/bio` (multipart, `@Roles(ORGANIZER)`) → returns the bio; C renders `artistBio` on the detail page.
Keep the API key in `.env` only. If no key is available for grading, fall back to a deterministic template so the flow still demos — but make the **real** call the default and note the fallback in the README.

## B3. 24h reminder (scheduled)

```ts
@Cron('*/15 * * * *') // every 15 min: find concerts starting in ~24h, remind buyers once
async sendReminders() {
  const window = { gte: addHours(now, 23.75), lte: addHours(now, 24.25) };
  const concerts = await this.prisma.concert.findMany({
    where: { startsAt: window, status: 'ON_SALE' }, include: { orders: { where: { status: 'PAID' } } },
  });
  for (const c of concerts)
    for (const o of c.orders)
      // dedup: only enqueue if no REMINDER notification for (user, concert) exists yet
      await this.notif.enqueueOnce(o.userId, 'REMINDER', { concertId: c.id });
}
```

Reuse the **channel Strategy** + BullMQ from Week 2 — no new infra. Dedup so a buyer isn't reminded twice.

---

# CARRY-OVER — Audience & Admin Web (Week-2 scope, must land first)

> **Owned by whoever has slack — A/B recommended** (backend is done). This is a **prerequisite** for the Day-17 gate and the video; without it there is no `buy → e-ticket` to show. Build on the existing `src/web` scaffold (`useAuth`, `ProtectedRoute`, `Login`, `Home`, `ConcertDetail`, `admin/Dashboard` — currently on `mockConcerts.ts`).

## CW1. Wire real APIs + auth (Day 13)
- Replace `src/web/src/data/mockConcerts.ts` usage with `GET /concerts` and `GET /concerts/:slug` via the axios client.
- Store the JWT from `POST /auth/login`; attach `Authorization: Bearer …` on all calls; keep the existing role-based routing (AUDIENCE → browse, ORGANIZER → admin, SCANNER → scanner app).

## CW2. Purchase flow + e-ticket QR (Day 14–15) — unblocks the headline demo
- ConcertDetail: select ticket type + quantity → `POST /orders` with a generated **`Idempotency-Key`** header (UUID per checkout attempt; reuse it on retry — this makes A's #4a demo real from the UI).
- Redirect to the mock gateway page (:4000) → on return call `POST /orders/:id/confirm`.
- On success render the **e-ticket QR** — add `qrcode.react` and render the ticket's `qrCode` value.
- Handle error states explicitly: sold out (409), per-user limit (400), payment unavailable (503 from the breaker).

## CW3. Interactive SVG zone map + real-time remaining (Day 15)
- Render GA/SVIP/VIP/CAT1/CAT2 as a clickable SVG; clicking a zone selects that ticket type.
- Show **remaining per type**; poll `GET /concerts/:slug` every few seconds (cache-backed → cheap). Grey out sold-out zones.

## CW4. Admin UI + AI-bio upload + in-app notifications (Day 16)
- ORGANIZER: CRUD forms for concerts/ticket types (name/price/qty/sale-start), a **cancel** button, and a revenue dashboard reading `GET /admin/concerts/:id/stats`.
- AI bio: a PDF upload control → `POST /concerts/:id/bio` (multipart) → show the returned bio; render `artistBio` on ConcertDetail (closes the AI-bio loop — B builds the endpoint in B2).
- AUDIENCE: in-app notification list from the `Notification` rows.

> **Cut order if time runs out:** keep CW1+CW2 (buy→e-ticket is the headline demo). CW3 can degrade to a styled list instead of an SVG; CW4 admin can fall back to Swagger/curl on camera — state it honestly.

---

# PERSON C — PWA scanner, sync engine, VIP mode (the big one)

Your week, in order: **PWA shell → IndexedDB + QR scan + local dedup → sync engine → VIP guest mode.**
This is the time sink (plan.md §8). If you have slack from Week 2, start the service-worker + IndexedDB spike **early**.

## C1. PWA shell that opens offline (Day 13)

- `public/manifest.json` (name, icons, `display: standalone`, start_url).
- **Service worker:** precache the app shell (HTML/JS/CSS) so the scanner **opens with no network**. Use Vite's `vite-plugin-pwa` (Workbox) — don't hand-roll caching.
- Verify: `npm run build && preview`, turn off network in DevTools, reload → the app still opens.

## C2. IndexedDB stores + QR scan + local dedup (Day 14–15)

Use **Dexie** (thin IndexedDB wrapper). Three stores:

```ts
// scanner/src/db/db.ts
db.version(1).stores({
  validTickets: 'qrCode, ticketId',                 // pre-downloaded valid set
  scanQueue:    'clientLogId, ticketId, syncStatus', // local log of scans (offline-first)
  guests:       'id, docId, fullName',               // pre-downloaded guest list (VIP mode)
});
```

**Pre-download (while online):** hit A's `GET /concerts/:id/tickets/valid` and `/guests`, fill `validTickets` and `guests`. Show the operator a "ready for offline" indicator.

**Scan flow (`html5-qrcode`):**
```ts
async function onScan(qrCode: string) {
  const t = await db.validTickets.get(qrCode);
  if (!t) return show('INVALID — not in list');

  // LOCAL double-scan guard: already in this device's queue?
  const dup = await db.scanQueue.where({ ticketId: t.ticketId }).first();
  if (dup) return show('ALREADY SCANNED on this device');

  await db.scanQueue.add({
    clientLogId: crypto.randomUUID(),   // unique → idempotent server sync
    ticketId: t.ticketId,
    deviceId: DEVICE_ID,
    scannedAt: new Date().toISOString(),
    syncStatus: 'PENDING',
  });
  show('✓ ACCEPTED (offline)');
}
```
**This blocks the same ticket twice on one device** even with no network — that's half of mechanism #4b.

## C3. Sync engine + conflict UX (Day 16)

```ts
async function sync() {
  if (!navigator.onLine) return;
  const pending = await db.scanQueue.where({ syncStatus: 'PENDING' }).toArray();
  if (!pending.length) return;

  const res = await api.post('/checkin/sync', { scans: pending });
  for (const r of res.data) {
    const local = pending.find(p => p.clientLogId === r.clientLogId);
    if (r.result === 'ACCEPTED' || r.result === 'ALREADY_SYNCED') {
      await db.scanQueue.update(local.clientLogId, { syncStatus: 'SYNCED' });
    } else if (r.result === 'DUPLICATE') {
      // the OTHER device's scan won the race → surface a conflict in the UI
      await db.scanQueue.update(local.clientLogId, { syncStatus: 'FAILED' });
      notifyConflict(local.ticketId); // "This ticket was already used on another device"
    }
  }
}
window.addEventListener('online', sync);   // auto-sync on reconnect
setInterval(sync, 5000);                   // and periodically while online
```

**The graded demo:** one ticket, two devices both offline, each scans it (both locally accept), reconnect both → first to sync gets `ACCEPTED`, second gets `DUPLICATE` and shows a conflict. **Say on camera that offline simultaneous scans are only detectable at sync, never preventable in real time.**

## C4. VIP guest-list mode (Day 16)

A second scanner mode for the VIP gate:
- Operator searches the pre-downloaded `guests` store by name/doc (offline-capable).
- On match → call A's `POST /guests/check-in` when online, or queue it like a scan when offline.
- Show zone + checked-in status; block double check-in (mirrors the ticket flow).

---

# PHASE 4 — Hardening, docs, video, submit (Day 18–21)

**No new features.** If something's unfinished by Day 18, cut it cleanly rather than risk the video window (plan.md §10: a polished core beats a half-finished extra).

### Day 18 — clean-machine integration pass
- [ ] Fresh checkout → `docker-compose up` → `npm run seed` on a machine that has never run the project. **Fix anything that needs a manual step.** (postgres + redis + backend + web + scanner + mock-gateway all come up.)
- [ ] Walk every feature once: login (3 roles) → buy → e-ticket → offline scan → sync → CSV import → AI bio → admin dashboard.

### Day 19 — evidence + blueprint finalize
- [ ] Re-run **every** `scripts/load-test/*` on a fresh seed, **more than once** (a single green run hides races). Capture screenshots/logs: `oversell.js`, `per-user-limit.js`, `rate-limit.js`.
- [ ] After `oversell.js`, query the DB: `remainingQty` must be exactly `0`, never negative; PAID+reserved = stock.
- [ ] Finalize `blueprint/`: C4 L1 + L2 and HLA diagrams render (Mermaid on GitHub), ≥3 ADRs complete, **specs match the code as built** (especially the Option A/B check-in decision and the per-ticket-type row-lock tradeoff).

### Day 20 — record the video (follow plan.md §6)
1080p, ~720 kbps, MP4, each presenter **on camera**, live demo on the running app — no slides.
1. **Intro + architecture** — show C4 diagram from `design.md`.
2. **Oversell** — run `oversell.js` live → "sold = stock, 0 oversell" in DB.
3. **Per-user limit** — run `per-user-limit.js` → capped at `maxPerUser`.
4. **Rate limiting** — burst → fair 429s.
5. **Payment instability** — toggle mock gateway to fail → circuit opens, **browsing still works** (graceful degradation); resend same Idempotency-Key → one charge.
6. **Offline check-in** — network off → scan works → reconnect → syncs → same ticket on a 2nd device → server rejects on sync (**state the offline limitation honestly**).
7. **CSV + AI bio** — import the 3 sample CSVs (valid/errors/dups) → bad rows logged, no dup; upload press-kit PDF → generated bio appears.
8. **Caching** — DB query count / latency drop on cached reads; buy → `remaining` updates.

### Day 21 — upload + submit
- [ ] Upload the whole structure to a **public** Drive folder ("anyone with link").
- [ ] Create the submission file `groupcode_mssv1_mssv2_mssv3.txt` containing **only the public Drive link**.
- [ ] Walk the §7 traceability matrix top-to-bottom as the final acceptance gate, then submit.

---

# Day 17 acceptance gate (features complete)

1. Scanner app **opens with no network**.
2. Pre-download a concert's valid tickets + guest list while online.
3. Network off → scan a valid ticket → ✓ accepted locally; scan it again → **blocked locally**.
4. Reconnect → scans sync; `Ticket.status = USED`.
5. **2 devices both offline** scan the same ticket → reconnect → first `ACCEPTED`, second `DUPLICATE` with a conflict shown. ✅
6. VIP mode: find a guest by name/doc (offline) → check in → syncs.
7. CSV: import valid/errors/dups → bad rows logged, no crash, no dup guests, re-import skipped. ✅
8. AI bio: upload PDF → bio generated and shown on detail page.
9. 24h reminder job emits reminders (test by setting a concert ~24h out).
10. **Audience web (carry-over):** browse concerts from the **real API** → buy a ticket end-to-end → **e-ticket QR appears in the browser**; SVG zone map shows live remaining.
11. **Admin web (carry-over):** ORGANIZER logs in → create/edit/cancel a concert + ticket types → revenue dashboard renders; AI bio shows on the detail page; AUDIENCE sees an in-app notification.

If 1–11 pass, all features are in and Phase 4 (hardening + video + submit) can run clean. (10–11 are the Week-2 carry-over — they gate the headline `buy → e-ticket` demo, so do not skip them.)

---

# Final submission checklist (plan.md §7 — walk before submitting)
- [ ] **Blueprint** present: single `blueprint.pdf` **or** `blueprint/` folder (proposal + design + specs).
- [ ] **`src/`** complete; all 7 mechanisms **real, not stubs**.
- [ ] **`data/`**: seed script + 4 seeded concerts + sample CSV (×3) + sample press-kit PDF.
- [ ] **`README.md`**: clone-and-run with **no extra questions** (prereqs, one-command start, seed, test accounts + plaintext passwords, how to run each demo).
- [ ] **`clips/`** video: 1080p, ~720 kbps, MP4, presenter camera on, live demo.
- [ ] Drive folder **public** (anyone with link).
- [ ] Submission file `groupcode_mssv1_mssv2_mssv3.txt` containing the Drive link.
- [ ] Clean-machine `docker-compose up` dry run done before submitting.

---

## Carry-over decisions closed this week
- **Check-in constraint (A ↔ C):** Option A vs B locked Day 13 and written into `specs/checkin.md`.
- **Sync conflict shape (A → C):** the `ACCEPTED / DUPLICATE / ALREADY_SYNCED` result contract agreed Day 14 so the scanner UI and server speak the same language.
- **CSV concert resolution (B):** how a file maps to a concert (filename convention or a header column) documented in `specs/csv-ingestion.md`.
