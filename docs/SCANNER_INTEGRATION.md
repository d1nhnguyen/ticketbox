# Scanner PWA — Backend Integration Reference

> **Status date:** 2026-07-13
> **Scope:** `src/scanner` wired to the real NestJS backend, closing `docs/COMPLETION_PLAN.md` §3.1 (P0 — Scanner integration).
> **Audience:** anyone extending the scanner, debugging a sync issue, or preparing the offline check-in demo.

## 1. What changed and why

Before this work, `src/scanner` was a standalone mock: `syncEngine.ts` had `MOCK_API = true`, pre-download inserted fabricated tickets/guests, there was no login screen even though every scanner endpoint is JWT + `Role.SCANNER` guarded, `deviceId` was a new random value on every scan, VIP check-in never left the device, and the PWA manifest referenced two icon files that didn't exist. The backend side (`/checkin/sync`, `/concerts/:id/tickets/valid`, `/concerts/:id/guests`, `/guests/verify`, `/guests/check-in`) was already fully implemented and unused.

This document describes the resulting architecture: the session/auth layer, the real data flow (login → concert selection → pre-download → offline scan → sync), the Dexie schema, and the exact backend contracts the client code depends on. No backend code changed.

## 2. Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Scanner PWA (src/scanner)                │
│                                                                   │
│  App.tsx (view state machine)                                    │
│    LOGIN ──login──▶ SELECT_CONCERT ──pick──▶ SCAN                │
│      ▲                                          │                │
│      └──────────────── auth-expired (401) ──────┘                │
│                                                                   │
│  services/session.ts   — token, selected concert, device id      │
│  services/api.ts       — axios + interceptors + typed endpoints  │
│  services/preload.ts   — snapshot download → Dexie               │
│  services/syncEngine.ts— outbound flush (tickets + guests)        │
│  db/db.ts (Dexie v2)   — validTickets, scanQueue, guests,        │
│                           guestCheckinQueue, meta                 │
│  components/           — LoginView, ConcertSelectView,           │
│                           ScannerTab (QR), VIPTab (guest search)   │
└───────────────────────────┬───────────────────────────────────────┘
                             │ Bearer JWT, HTTPS/HTTP
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (src/backend, NestJS)                 │
│  POST /auth/login                 — public, rate-limited         │
│  GET  /concerts                   — public                       │
│  GET  /concerts/:id/tickets/valid — SCANNER only                 │
│  GET  /concerts/:id/guests        — SCANNER only                 │
│  POST /checkin/sync               — SCANNER only                 │
│  POST /guests/verify              — SCANNER only                 │
│  POST /guests/check-in            — SCANNER only                 │
└─────────────────────────────────────────────────────────────────┘
```

The scanner never uses a router (`react-router-dom` stays installed but unused). Navigation is a plain `View` union rendered conditionally in `App.tsx`, because the initial view must be computable **synchronously from localStorage with zero network** — this is what makes an offline page reload land back on the scan screen instead of a blank/error state.

## 3. Session and authentication

**File:** [src/scanner/src/services/session.ts](../src/scanner/src/services/session.ts)

| Concern | Mechanism |
|---|---|
| Token storage | `localStorage['scanner_token']` |
| Role extraction | Backend `POST /auth/login` returns only `{ access_token }` — no role field. The role lives inside the JWT payload (`{ sub, email, role, exp }`), so the client decodes it itself: `atob(token.split('.')[1])` with base64url→base64 normalization (`-`→`+`, `_`→`/`). No `jwt-decode` dependency was added; this mirrors `src/web/src/pages/Login.tsx`'s existing hand-rolled decode. |
| Expiry check | Local only — `payload.exp * 1000 <= Date.now()` clears the session. There is **no server-side session validation call**; the JWT is stateless and the scanner is offline-first, so round-tripping to verify a token on every app open would defeat the purpose. |
| Role gate | `LoginView` rejects any decoded role other than `SCANNER` **before** calling `setToken()` — a non-scanner account never gets a token written to storage. |
| Device ID | `localStorage['scanner_device_id']`, lazily created once via `crypto.randomUUID()` and reused for every scan from that device. This directly satisfies the requirement that check-in audit logs be attributable to a stable device. |
| Selected concert | `localStorage['scanner_concert']` (JSON `{id, title}`). Survives logout — an operator can log back in without re-selecting the concert. |
| Logout | `clearSession()` removes only the token. Device ID and selected concert are intentionally preserved. |

### 401 handling without a router

[api.ts](../src/scanner/src/services/api.ts) installs an axios response interceptor: any `401` **not** originating from `/auth/login` (so a wrong-password attempt doesn't wipe state) calls `clearSession()` and dispatches `window.dispatchEvent(new Event('auth-expired'))`. `App.tsx` listens for that event and flips `view` back to `LOGIN`. Because Dexie is untouched by this path, any scans or guest check-ins still queued locally survive the forced logout and sync normally once the operator signs back in.

## 4. Data flow

### 4.1 Login → concert selection → pre-download

```
LoginView            ConcertSelectView         App.tsx (SCAN header)
  │ POST /auth/login       │ GET /concerts            │
  │ decode role            │ pick concert              │ downloadSnapshot(concert)
  │ reject if != SCANNER   │ setSelectedConcert()      │   → GET tickets/valid
  │ setToken()             │                            │   → GET guests
  └────────────────────────┴────────────────────────────┘   → one Dexie tx: replace
                                                              only this concert's rows
                                                              + write meta.snapshot
```

**Backend contracts consumed:**

```
POST /auth/login
  body: { email, password }
  → { access_token }                      // role decoded client-side from JWT

GET /concerts                              // public
  → [{ id, title, slug, venue, startsAt, status }]

GET /concerts/:id/tickets/valid            // JWT + Role.SCANNER
  → [{ ticketId, qrCode }]

GET /concerts/:id/guests                   // JWT + Role.SCANNER
  → [{ id, fullName, docId, zone, status: 'INVITED'|'CHECKED_IN' }]
```

`tickets/valid` does not return `concertId`, so [preload.ts](../src/scanner/src/services/preload.ts) injects it client-side from the concert the operator selected. The download is a **single Dexie transaction** that deletes only rows matching the selected `concertId` (not the whole table) and bulk-inserts the fresh snapshot, so switching between concerts never touches other concerts' cached data. It also never removes `scanQueue` or `guestCheckinQueue` — pending offline work must survive a re-download. Before replacing guests, it reads pending guest check-ins for that concert and preserves their optimistic `CHECKED_IN` status when the server snapshot still says `INVITED`.

### 4.2 Offline ticket scan

```
ScannerTab.onScanSuccess(qrCode)
  │
├─ db.validTickets.get(qrCode)             — local lookup, no network
│    not found or concertId != selected concert
│      → reject "invalid / not in this event"
  │
  ├─ db.scanQueue.where({ticketId}).first()  — local dedup, no network
  │    found → reject "already scanned on this device"
  │
  └─ db.scanQueue.add({
       clientLogId: crypto.randomUUID(),
       ticketId, deviceId: getDeviceId(),
       scannedAt: new Date().toISOString(),
       syncStatus: 'PENDING'
     })
     → accepted locally; syncPendingRecords() fired immediately if online
```

This two-layer guard (local IndexedDB dedup + server-side atomic flip, see §5) is unchanged from the pre-existing design — the only client-side edit was replacing the random per-scan `deviceId` with the persisted one from `session.ts`.

### 4.3 Sync engine (outbound)

**File:** [src/scanner/src/services/syncEngine.ts](../src/scanner/src/services/syncEngine.ts)

`startSyncEngine()` is called from an `App.tsx` effect scoped to the `SCAN` view and **returns a cleanup function** — required so a React StrictMode double-mount (or a view transition away from SCAN) doesn't leave a duplicate `setInterval`/`online` listener running.

```ts
export function startSyncEngine(): () => void {
  const onOnline = () => { void syncPendingRecords(); };
  window.addEventListener('online', onOnline);
  const interval = setInterval(onOnline, 10_000);
  void syncPendingRecords();               // immediate kick on mount
  return () => {
    window.removeEventListener('online', onOnline);
    clearInterval(interval);
  };
}
```

`syncPendingRecords()` is guarded by a module-level `syncing` flag so overlapping cycles (e.g. an `online` event firing mid-interval-tick) never run concurrently. Each cycle flushes tickets, then guests.

**Ticket flush contract:**

```
POST /checkin/sync                          // JWT + Role.SCANNER
  body: { scans: [{ clientLogId, ticketId, deviceId, scannedAt }] }
  → [{ ticketId, clientLogId, result: 'ACCEPTED' | 'DUPLICATE' | 'ALREADY_SYNCED' }]
```

| Server result | Client action |
|---|---|
| `ACCEPTED` | `scanQueue` row → `SYNCED` |
| `ALREADY_SYNCED` (resend of a `clientLogId` already logged server-side) | `scanQueue` row → `SYNCED` — idempotent, no new server log |
| `DUPLICATE` (a *different* `clientLogId` for a ticket another device already checked in) | `scanQueue` row → `FAILED`, and a `sync-conflict` `CustomEvent` (`detail: { ticketId }`) is dispatched — `ScannerTab` listens for this exact event/shape and shows the conflict banner. **This event contract was preserved unchanged.** |

Failure handling on the request itself: a network error or 5xx leaves the batch `PENDING` for the next cycle; a `400` (malformed batch — a client bug, not a transient condition) marks every record in that batch `FAILED` so a poison-pill record can't block sync forever; a `401` is handled entirely by the `api.ts` interceptor (session cleared, records stay `PENDING`, resent after re-login).

**Guest flush contract** (sequential, one request per queued guest — there is no batch endpoint):

```
POST /guests/check-in                      // JWT + Role.SCANNER
  body: { guestId }
  → { ok: boolean, alreadyCheckedIn: boolean }
```

| Server response | Client action |
|---|---|
| `{ ok: true }` | queue row → `SYNCED`, `resolution: 'OK'` |
| `{ ok: false, alreadyCheckedIn: true }` | queue row → `SYNCED`, `resolution: 'ALREADY_CHECKED_IN'` (idempotent — **not** an error), and `db.guests` status forced to `CHECKED_IN` |
| `404` | queue row → `FAILED`, `resolution: 'NOT_FOUND'` |
| network/5xx | loop breaks, remaining rows stay `PENDING` |

### 4.4 VIP guest check-in (offline-first)

**File:** [src/scanner/src/components/VIPTab.tsx](../src/scanner/src/components/VIPTab.tsx)

Guest search remains fully offline (query `db.guests` by the selected `concertId`, then filter by name/docId — no network call). This concert scope is required because snapshots for other concerts remain cached on the device. Checking a guest in writes to two tables in **one transaction**:

```ts
await db.transaction('rw', db.guests, db.guestCheckinQueue, async () => {
  await db.guests.update(guest.id, { status: 'CHECKED_IN' });
  await db.guestCheckinQueue.put({
    guestId: guest.id, concertId: guest.concertId,
    queuedAt: new Date().toISOString(), syncStatus: 'PENDING',
  });
});
```

The queue's primary key is the **guest ID itself**, not a generated UUID. This is a deliberate idempotency device: tapping check-in twice offline on the same guest just overwrites the same row (`put`, not `add`), so there's no duplicate-request risk to reason about later. A live badge (pending sync / synced / synced-elsewhere / failed) is rendered per guest from `useLiveQuery` over `guestCheckinQueue`.

This queue is intentionally **separate** from `scanQueue` — the record shapes are incompatible (guest check-ins have no `clientLogId`/`ticketId`), and mixing them would have forced the sync engine to type-discriminate every row.

## 5. Double-scan prevention (two layers)

This is unchanged from the existing backend design (`blueprint/specs/checkin.md`) but is worth restating because the scanner is now what actually exercises it:

1. **Device-local (offline, instant):** `db.scanQueue.where({ ticketId }).first()` — if this device already queued a scan for that ticket, reject immediately without any network call.
2. **Server (on sync):** an atomic conditional `updateMany(WHERE status = 'VALID')` flips the ticket to `USED`. Exactly one concurrent/racing sync request flips a row; every other request — including a second offline device syncing later — gets `DUPLICATE`.

**Known limitation, unchanged by this work:** two devices that are *both offline* when they scan the same ticket cannot be reconciled in real time — only at sync time, when the second one to reach the server gets `DUPLICATE` and its operator sees the conflict banner. This is inherent to offline-first design and should be called out explicitly in the demo video.

## 6. Dexie schema (IndexedDB)

**File:** [src/scanner/src/db/db.ts](../src/scanner/src/db/db.ts)

```ts
version(1): validTickets(qrCode,ticketId) · scanQueue(clientLogId,ticketId,syncStatus) · guests(id,docId,fullName)
version(2): + concertId index on validTickets/guests
            + guestCheckinQueue(guestId, syncStatus)
            + meta(key)
            .upgrade(): clears validTickets/guests/scanQueue — v1 held only fabricated mock rows
```

| Table | Purpose | Notes |
|---|---|---|
| `validTickets` | Downloaded snapshot of VALID tickets for the selected concert | PK `qrCode` (the literal scanned string); slimmed to `{qrCode, ticketId, concertId}` — the backend doesn't return `ticketTypeId`/`maxPerUser` and nothing used them, so they were dropped rather than left as dead fields. |
| `scanQueue` | Outbound ticket check-in queue | PK `clientLogId` (client-generated UUID) — this is what makes resending a batch idempotent server-side. |
| `guests` | Downloaded guest list snapshot | PK `id` (server guest ID). |
| `guestCheckinQueue` | Outbound guest check-in queue | PK `guestId` — natural idempotency for repeated offline taps. |
| `meta` | Key-value snapshot metadata (`key: 'snapshot:<concertId>'`) | Records `{concertId, downloadedAt, ticketCount, guestCount}` per concert in the **same transaction** as the data it describes. Switching back to a previously downloaded concert therefore restores its own readiness timestamp/counts instead of showing metadata for only the most recently downloaded concert. |

## 7. Environment configuration

Neither frontend previously used `import.meta.env` anywhere — every API base URL was a hardcoded `http://localhost:3000` literal. This work introduces the first Vite env vars in the project:

| Var | Package | Default | Purpose |
|---|---|---|---|
| `VITE_API_URL` | `src/scanner` | `http://localhost:3000` | Backend origin the scanner's axios instance targets. |
| `VITE_SCANNER_URL` | `src/web` | `http://localhost:5174` | Where the web app's `/scanner` page links out to. |

`.env.example` files exist in both packages. `docker-compose.yml` sets both as container environment variables for the `web` and `scanner` dev services. **Both values must stay `localhost:<host-port>`, never a Docker service DNS name** (e.g. `http://backend:3000`) — they are read by code running in the operator's/browser's JavaScript context, not inside the container network.

## 8. The `/scanner` web page

`src/web/src/App.tsx`'s `/scanner` route previously rendered a static "coming in Week 3" placeholder. It now renders a small link-out page pointing at `VITE_SCANNER_URL`. This is a link, not an automatic redirect — cross-origin auto-navigation away from the admin/audience web app would be a surprising UX for anyone who lands on that route by accident.

## 9. PWA icons

`vite.config.ts`'s manifest referenced `pwa-192x192.png` / `pwa-512x512.png`, which did not exist in `src/scanner/public`, producing install/manifest warnings. Both were generated with a one-off PowerShell `System.Drawing` script (no new npm dependency) and committed as static assets; `vite-plugin-pwa` picks them up automatically at build time — no config change was needed.

## 10. Verification performed

The full acceptance gate lives in `docs/COMPLETION_PLAN.md` §3.1; browser-only items (camera scanning, DevTools offline toggling, two-profile conflict UI) require manual driving and are not re-described here. What was verified end-to-end against a rebuilt backend container and real seed data:

| Check | Result |
|---|---|
| `scanner@ticketbox.dev` login → JWT decodes to `role: SCANNER` | ✅ |
| `audience@ticketbox.dev` login → JWT decodes to `role: AUDIENCE`; that token gets `403` from `GET tickets/valid` and `POST /checkin/sync` | ✅ |
| `GET /concerts/:id/tickets/valid` and `/guests` return real seeded rows (after rebuilding a stale backend image that predated the check-in module) | ✅ |
| First `POST /checkin/sync` for a ticket → `ACCEPTED` | ✅ |
| Resending the same `clientLogId` → `ALREADY_SYNCED`, no new log | ✅ |
| A second `clientLogId` for the same ticket (simulating a second device) → `DUPLICATE` | ✅ |
| CSV-imported guest → `POST /guests/verify` (by `docId`) finds them; `POST /guests/check-in` → `{ok:true, alreadyCheckedIn:false}`; repeat call → `{ok:false, alreadyCheckedIn:true}` | ✅ |
| `src/scanner`: `npm run build` (after `npm install` — lockfile was out of sync with manifest) | ✅ exit 0 |
| `src/web`: `npm run build` (after fixing two pre-existing unused-variable errors that blocked compilation: `setIssuedTickets` in `ConcertDetail.tsx`, `QRCodeSVG`/`orderId` in `VNPayReturn.tsx`) | ✅ exit 0 |
| Built scanner served via `vite preview`: index, manifest, both PNG icons, and `sw.js` all return `200` | ✅ |

**Not yet driven in a real browser** (requires manual QA, camera hardware, and two device profiles): live QR camera scanning, DevTools "Offline" reload landing on the SCAN view, local double-scan rejection, pending-scan survival across reload, auto-sync on reconnect, and the two-device conflict banner. These map directly to items 3–10 of the §3.1 acceptance gate and are the recommended next manual pass before recording the demo video.

## 11. Known side effects on shared dev data

Verification ran real writes against the Docker Postgres volume: one ticket for "Anh Trai Say Hi" is now `USED`, one guest (`John Doe`, uploaded from `data/sample-csv/guests-valid.csv`) is `CHECKED_IN`. Run `docker compose down -v && docker compose up -d --build` before recording a clean demo.

## 12. Files touched

**New:** `src/scanner/src/services/{session,api,preload}.ts`, `src/scanner/src/components/{LoginView,ConcertSelectView}.tsx`, `src/scanner/public/pwa-{192x192,512x512}.png`, `src/scanner/.env.example`, `src/web/.env.example`.

**Rewritten:** `src/scanner/src/services/syncEngine.ts` (MOCK_API removed entirely).

**Modified:** `src/scanner/src/db/db.ts` (Dexie v2), `src/scanner/src/App.tsx` (view state machine), `src/scanner/src/components/ScannerTab.tsx` (stable device ID), `src/scanner/src/components/VIPTab.tsx` (guest queue + sync badges), `src/web/src/App.tsx` (`/scanner` link-out page), `src/web/src/pages/ConcertDetail.tsx` and `VNPayReturn.tsx` (pre-existing unused-variable build errors, fixed as a build prerequisite), `docker-compose.yml` (env vars for web/scanner services).

## 13. Related documents

- `docs/COMPLETION_PLAN.md` §3.1 — the acceptance gate this work closes, and the remaining P0/P1 items (Docker payment path, order/payment security, green test baseline, etc.).
- `blueprint/specs/checkin.md` — the original design spec for double-scan prevention; unchanged by this work, restated here in §5 for context.
