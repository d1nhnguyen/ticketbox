# TicketBox — Remaining Work and Completion Plan

> **Status date:** 2026-07-13 (rev. 2 — strict-compliance review applied)  
> **Branch audited:** `develop`  
> **Purpose:** This is the current authoritative completion checklist. Older week guides remain useful as historical implementation notes, but their status labels are no longer reliable.
>
> **Revision 2 changes:** scheduled CSV ingestion is now required (not optional); the mock-payment default must be justified as a documented scope decision in `blueprint/proposal.md`; a spike-profile load-test scenario is a required P1 evidence item; the AI-bio demo must show a real provider call, not the fallback template; the forged VNPay-callback exploit is named as the top security fix.

## 1. Executive summary

TicketBox has most of its backend domain logic and web features in place. The proposal, architecture design, register flow, cancellation notifications, check-in API, AI bio, reminder job, CSV upload, QR ticket UI, admin screens, and load-test scripts all exist in the current tree.

The project is **not yet ready for demonstration or submission** because the real scanner workflow is not integrated, the default Docker payment path is misconfigured, builds/tests are not green, several security and payment-validation issues remain, and final evidence/submission artifacts have not been produced.

### Completion priorities

| Priority | Outcome | Why it matters |
|---|---|---|
| **P0** | Real scanner-to-backend integration | Offline check-in/double-scan is one of the seven graded mechanisms and is still mocked in the actual PWA. |
| **P0** | Working payment flow from a clean Docker start | The backend container currently cannot reach the mock gateway with its default URL; VNPay is selected by default without usable credentials. |
| **P0** | Close order/payment security gaps | The unauthenticated VNPay return endpoint plus an empty-string default secret lets anyone forge a PAID order and receive free tickets in the default configuration; one user can fail another user's pending order. |
| **P0** | Green builds and tests | The repository currently cannot pass a clean verification gate. |
| **P1** | Complete email/e-ticket delivery and accurate admin revenue | These are explicit functional requirements, not only polish. |
| **P1** | Scheduled CSV ingestion | `requirements.md` explicitly requires periodic import ("định kỳ nhập", "gửi theo lịch cố định"); upload-only does not satisfy a strict reading. |
| **P1** | Spike-profile load evidence and real-AI demo proof | The 80k/70%-first-minute traffic shape and the AI integration must both be demonstrated with observable evidence, not implied. |
| **P1** | Make documentation match the current code | Existing gap/week documents contain contradicted and obsolete claims. |
| **P1** | Clean-machine proof, video, and submission package | These are required deliverables. |

## 2. Verified current baseline

### 2.1 Implemented and present

- [x] Four seeded concerts and accounts for `AUDIENCE`, `ORGANIZER`, and `SCANNER`.
- [x] JWT authentication, role guards, public registration forced to `AUDIENCE`.
- [x] Concert list/detail APIs and audience web pages.
- [x] Ticket-type configuration, sale-start enforcement, per-account limit, and atomic inventory reservation.
- [x] Redis idempotency, rate limiting, cache-aside reads, and cache invalidation.
- [x] Payment gateway circuit breaker and mock gateway service.
- [x] Order confirmation, QR ticket issuance, audience ticket dashboard, and in-app notifications.
- [x] Admin concert/ticket CRUD, cancellation flow, cancellation listener, CSV and AI-bio upload screens.
- [x] CSV validation, checksum deduplication, row-level error handling, and BullMQ processing.
- [x] AI PDF extraction/provider selection/fallback.
- [x] 24-hour reminder cron and deduplicated in-app reminder creation.
- [x] Check-in sync API, ticket pre-download endpoint, guest pre-download endpoint, and server-side double-scan rejection.
- [x] PWA shell, IndexedDB tables, camera QR scanner, local ticket deduplication, and conflict UI primitives.
- [x] Check-in double-scan proof script exists at `scripts/load-test/checkin-double-scan.js`.
- [x] Blueprint proposal, C4 diagrams, failure-isolation section, ADR section, and feature specs exist.
- [x] Docker Compose defines Postgres, Redis, mock gateway, backend, web, and scanner services.

### 2.2 Verification result at audit time

| Check | Result |
|---|---|
| Backend unit tests | **Failed:** 36 passed, 7 failed. All seven failures are stale `OrdersService` test setup missing a `VNPayService` provider. |
| Backend build | **Blocked by local dependency drift:** declared packages are absent from the installed `node_modules`. |
| Web build | **Failed:** local dependency drift plus unused TypeScript variables. |
| Scanner build | **Blocked by local dependency drift.** |
| Mock gateway build | **Passed.** |
| Docker Compose syntax | **Passed** with `docker compose config`. |
| Full clean-machine journey | **Not yet evidenced.** |

The missing-module failures should first be rechecked after `npm ci`; the dependencies are already declared in the package manifests and lockfiles.

## 3. Remaining work inventory

## 3.1 P0 — Scanner integration

> **Implemented 2026-07-13.** Full design, data-flow, and contract reference: [`docs/SCANNER_INTEGRATION.md`](SCANNER_INTEGRATION.md). All backend contracts below were verified live against a rebuilt backend container (login/role decode, 403 for non-SCANNER, ACCEPTED/ALREADY_SYNCED/DUPLICATE, guest check-in idempotency, both frontend builds green, PWA shell/manifest/icons/service-worker all serve). **Not yet verified:** the browser-only items in the acceptance gate below (camera scanning, DevTools offline reload, two-device conflict UI) — these need a manual pass before the demo recording. Checkboxes are left unchecked until that pass runs, per this document's own rule in §5 that owners must supply acceptance evidence rather than mark gates complete because code exists.

The gaps originally listed here (`MOCK_API = true`, fabricated pre-download data, no login/session flow, no JWT on real requests, no concert selection, random per-scan `deviceId`, commented-out VIP check-in call, no guest outbound queue, hardcoded API URLs, missing PWA icons, obsolete `/scanner` web placeholder) have all been addressed in code — see the integration doc for what replaced each one.

### Implementation plan

1. Add a scanner API module, for example `src/scanner/src/services/api.ts`:
   - Read `VITE_API_URL`, defaulting to `http://localhost:3000` for local development.
   - Store the scanner JWT in local storage.
   - Add an Axios request interceptor for `Authorization: Bearer <token>`.
   - On `401`, clear the invalid session and return to scanner login.
2. Add scanner login:
   - Submit to `POST /auth/login`.
   - Decode or validate the returned role and reject non-`SCANNER` users in the UI.
   - Provide logout and visible current-account state.
3. Add concert selection while online:
   - Fetch available concerts.
   - Persist the selected concert ID and display its name in the scanner header.
4. Replace fabricated pre-download data:
   - `GET /concerts/:id/tickets/valid`.
   - `GET /concerts/:id/guests`.
   - Replace only the selected concert's local snapshot in one IndexedDB transaction.
   - Store snapshot timestamp and concert ID for operator visibility.
5. Persist a stable device ID:
   - Generate a UUID once.
   - Store it in local storage/IndexedDB.
   - Reuse it for every ticket and guest check-in from that device.
6. Enable real ticket synchronization:
   - Remove `MOCK_API` branching.
   - Send only `PENDING` records to `POST /checkin/sync`.
   - Preserve `PENDING` after network/server failure.
   - Map `ACCEPTED`, `ALREADY_SYNCED`, `DUPLICATE`, and validation errors explicitly.
   - Prevent overlapping sync cycles.
   - Return a cleanup function from `startSyncEngine` so React development remounts do not create duplicate intervals/listeners.
7. Add a dedicated guest check-in queue:
   - Do not overload ticket `scanQueue` with incompatible records.
   - Queue guest IDs offline.
   - Sync to `POST /guests/check-in` when online.
   - Handle “already checked in” as an idempotent/conflict result.
8. Add missing PWA icons and verify the generated service worker/application shell.
9. Replace the web `/scanner` placeholder with a clear link/redirect to the scanner origin configured through an environment variable.

### Acceptance gate

- [ ] A scanner user can log in and a non-scanner role is rejected.
- [ ] An operator selects a real concert and downloads its real tickets/guests.
- [ ] The app reloads and opens while offline with the cached shell and data.
- [ ] The first local ticket scan succeeds; a second scan on the same device is blocked locally.
- [ ] Pending scans survive a browser reload.
- [ ] Reconnecting automatically syncs pending scans to the backend.
- [ ] Two offline devices scanning the same ticket produce one server `ACCEPTED` and one `DUPLICATE` after synchronization.
- [ ] Re-sending the same `clientLogId` returns `ALREADY_SYNCED` without another log.
- [ ] VIP guests can be checked in offline and later synchronized.
- [ ] Device ID remains unchanged between scans and app reloads.
- [ ] `npm run build` succeeds and the installed PWA has no missing icon warnings.

## 3.2 P0 — Payment and Docker runnability

### Current gaps

- The backend Compose service does not set `MOCK_PAYMENT_URL=http://mock-gateway:4000`.
- The web checkout defaults to `VNPAY`, but the default Docker environment provides no VNPay URL, merchant code, secret, or return URL.
- The README describes frontends as host-only even though Compose now runs both.
- Frontend services run `npm install` on every container start, making startup slower and less deterministic.
- There are no health checks for backend, mock gateway, web, or scanner.

### Implementation plan

1. Set the backend container's internal mock gateway URL:

   ```yaml
   MOCK_PAYMENT_URL: http://mock-gateway:4000
   ```

2. Make mock payment the default demo method. Only display/enable VNPay when all required `VNPAY_*` values are configured.
3. Document the payment architecture as an explicit scope decision:
   - **Decision:** mock gateway is the default, fully working path; VNPay sandbox is an optional documented integration; MoMo is out of scope.
   - This is sanctioned by the assignment itself — `requirements.md`'s own proposal template lists "tích hợp payment gateway thật" as the canonical out-of-scope example — but it only counts if the scope section of `blueprint/proposal.md` states it. Add that statement.
   - Note in the blueprint that the graded "no stubs" clause applies to the §6/§7 protection mechanisms (rate limiting, circuit breaker, idempotency, caching), which are fully real against the mock gateway.
   - Keep all order state transitions in the backend.
4. Add environment validation for enabled payment mode:
   - If VNPay is enabled, require URL, merchant code, hash secret, and return URL.
   - Refuse to build a VNPay URL from empty values.
5. Use `npm ci` rather than `npm install` in deterministic Docker builds.
6. Prefer Dockerfiles for web/scanner rather than bind-mounted development containers for the final submission profile.
7. Add health checks and wait for backend readiness before marking the stack ready.
8. Update README instructions and service map to match the Compose file exactly.

### Acceptance gate

- [ ] On a clean machine, `docker compose up -d --build` starts every service.
- [ ] `GET /health` succeeds.
- [ ] A seeded audience user can buy through the default mock gateway and receive QR tickets.
- [ ] Switching the mock gateway to failure/timeout opens the circuit breaker after the configured threshold.
- [ ] Concert browsing remains usable while the breaker is open.
- [ ] A successful retry never creates a second charge or duplicate tickets.
- [ ] `blueprint/proposal.md` explicitly scopes mock-by-default / VNPay-optional / MoMo-out-of-scope.
- [ ] README commands work without undocumented environment changes.

## 3.3 P0 — Security and payment integrity

### Current gaps

1. **Forged-payment exploit (most severe):** `GET /orders/vnpay/return` is unauthenticated, `VNPAY_HASH_SECRET` defaults to the empty string, and the `VNPAY_*` variables are absent from the env validation schema. Anyone can compute a "valid" HMAC with the empty key, forge a successful return for any pending order ID, and receive issued tickets without paying — **in the default configuration**.
2. `POST /orders/:id/fail` does not pass the authenticated user ID to the service and therefore does not enforce order ownership.
3. VNPay return verification does not compare the paid amount to `Order.totalAmount`.
4. Signature comparison is not constant-time.
5. `POST /payment/charge`, `POST /payment/reset`, and `POST /debug/reminders/trigger` are public demo/debug endpoints.
6. Auth controller bodies use `any` rather than validated login/register DTOs.
7. CORS is unrestricted.

### Implementation plan

1. Close the forged-payment exploit first:
   - Refuse to **verify** signatures (not only build URLs) when the hash secret is unset or empty — `verifyReturnUrl` must fail closed.
   - Add `VNPAY_*` variables to the env validation schema; when VNPay is disabled, the return endpoint must reject all callbacks.
2. Change `failPayment(orderId)` to `failPayment(orderId, userId)` and reject when the order owner differs. Keep a regression test for the web `VNPayReturn` page, which legitimately calls `POST /orders/:id/fail` as the order owner after a failed return.
3. Add unit tests proving one audience user cannot read, confirm, pay, or fail another user's order, and that a forged/unsigned callback cannot fulfill an order.
4. In VNPay return processing:
   - Require configured credentials.
   - Verify signature using constant-time comparison (`crypto.timingSafeEqual`).
   - Validate order ID, amount against `Order.totalAmount`, currency, response status, and pending state.
   - Persist provider transaction number and payment result for audit if schema scope allows.
5. Restrict or conditionally register demo endpoints:
   - Organizer-only for manual reminder/reset, or
   - Only enable them when `ENABLE_DEMO_ENDPOINTS=true` and `NODE_ENV !== production`.
6. Add `RegisterDto` and `LoginDto` with email/password validation.
7. Configure CORS from an allowlist environment variable.

### Acceptance gate

- [ ] A callback signed with an empty/unset secret can never fulfill an order — the return endpoint fails closed when VNPay is not configured.
- [ ] Cross-user fail/confirm/read attempts return `403` or an equivalent access-denied response.
- [ ] Tampered VNPay signatures, order IDs, and amounts are rejected without issuing tickets.
- [ ] The app refuses to enable VNPay with an empty secret.
- [ ] Debug endpoints are unavailable or protected in the normal profile.
- [ ] Invalid auth bodies are rejected by `ValidationPipe` with clear 400 responses.

## 3.4 P0 — Restore a green verification baseline

### Dependency reset

Run in each Node package after preserving any intentional local dependency work:

```bash
cd src/backend && npm ci
cd ../web && npm ci
cd ../scanner && npm ci
cd ../mock-gateway && npm ci
```

### Code/test fixes

- Add a `VNPayService` mock provider to `src/backend/src/orders/orders.service.spec.ts`.
- Remove or use `setIssuedTickets` in `ConcertDetail.tsx`.
- Remove or use `QRCodeSVG` and `orderId` in `VNPayReturn.tsx`.
- Add check-in service tests for accepted, duplicate, invalid, and already-synced scans.
- Add notification listener tests for purchase and concert cancellation.
- Replace the default e2e “Hello World” test with useful smoke journeys.
- Add frontend tests for role routing, checkout error handling, and scanner queue/sync state transitions.

### Required verification commands

```bash
cd src/backend
npm run build
npm test -- --runInBand
npm run test:e2e
npm run lint

cd ../web
npm run build
npm run lint

cd ../scanner
npm run build
npm run lint

cd ../mock-gateway
npm run build
```

### Acceptance gate

- [ ] Every command above exits with code 0.
- [ ] No test depends on execution order or leftover database state.
- [ ] Tests cover the newly fixed authorization and payment validation paths.
- [ ] The clean Docker image builds use the lockfiles without modifying them.

## 3.5 P1 — Notification email with e-ticket

### Current gaps

- SMTP defaults point to `smtp.example.com`, so the default stack cannot deliver email.
- Successful-order email contains no embedded or attached QR ticket.
- Email errors are caught and logged inside the channel, so BullMQ may consider a failed delivery successful.
- There is no clear retry/failure status or delivery audit for email.
- Reminder delivery is in-app only, while purchase and cancellation listeners enqueue both channels.

### Implementation plan

1. Add Mailpit or Mailhog to Docker Compose for a deterministic local demo.
2. Configure backend `MAIL_HOST`, `MAIL_PORT`, sender, and optional authentication from environment variables.
3. Load the paid order with its user, concert, ticket type, and tickets before composing the message.
4. Generate QR images or embed QR data in a simple HTML e-ticket; attach one ticket per issued QR.
5. Escape all user/content values inserted into email HTML.
6. Throw on transient SMTP errors so BullMQ retries with exponential backoff.
7. Record success/failure consistently, including final failure after retries.
8. Document how to view captured emails in the local mail UI.

### Acceptance gate

- [ ] Buying a ticket creates an in-app confirmation and a captured email.
- [ ] The email contains the correct concert/order information and usable QR ticket(s).
- [ ] SMTP outage triggers retries and a visible final failure instead of silent success.
- [ ] Reprocessing does not generate duplicate in-app notifications or uncontrolled duplicate emails.

## 3.6 P1 — Accurate organizer reporting

### Current gap

The admin UI calculates sales and revenue from depleted inventory. Pending reservations reduce `remainingQty`, so the UI overstates paid revenue and sold-ticket counts.

### Implementation plan

1. Use `GET /admin/concerts/:id/stats` as the source for paid revenue and paid ticket counts.
2. Show separate values for:
   - paid tickets/revenue,
   - pending reserved inventory,
   - remaining inventory,
   - expired/failed orders if useful.
3. Ensure the backend statistics query only includes the intended order statuses.
4. Add a test containing one paid and one pending order to prove the distinction.

### Acceptance gate

- [ ] A pending reservation changes availability but not paid revenue.
- [ ] Confirmation moves its amount into revenue exactly once.
- [ ] Failure/expiry returns inventory and never appears as revenue.

## 3.7 P1 — Scheduled CSV ingestion (required)

### Current gap

The implemented flow is organizer upload-triggered. `requirements.md` explicitly requires periodic import: the sponsor "sends the CSV at night before the event" ("gửi vào ban đêm"), TicketBox must "định kỳ nhập danh sách này", and technical problem #5 restates "CSV được gửi theo lịch cố định". Upload-only does not satisfy a strict reading.

### Required approach

**Implement scheduled ingestion.** Watch/poll a mounted inbox such as `/data/inbox` (a cron/BullMQ repeatable job polling every few minutes is sufficient), checksum each new file, enqueue it through the existing CSV pipeline, then archive it into success/failure directories.

This is a thin layer over code that already exists: checksum deduplication, row-level error handling, and BullMQ processing are all implemented — only the file-watcher trigger in front of them is new. Keep the organizer upload endpoint as a secondary manual trigger.

Documentation-only scope interpretation is acceptable **only with explicit instructor approval**, recorded in the blueprint. Do not choose it silently.

The scheduled flow must be reflected consistently in `requirements.md` traceability, `blueprint/specs/csv-ingestion.md`, architecture diagrams, README, and the demo script.

### Acceptance gate for scheduled ingestion

- [ ] A new CSV placed in the inbox is processed without an HTTP upload.
- [ ] Reintroducing identical content is skipped by checksum.
- [ ] Invalid rows are reported while valid rows still import.
- [ ] A malformed file cannot crash the scheduler/worker.
- [ ] Processed files are archived with an inspectable result.

## 3.8 P1 — Frontend configuration and maintainability

### Remaining work

- Create shared API clients for web and scanner.
- Replace every hardcoded `http://localhost:3000` and `http://localhost:4000` with environment configuration.
- Add consistent auth-expiry handling.
- Remove dead `src/web/src/data/mockConcerts.ts`.
- Remove obsolete `/scanner` placeholder content.
- Fix duplicate/unused purchase-success state in `ConcertDetail.tsx` and `VNPayReturn.tsx`.
- Add loading, empty, and retry states where API calls currently only log errors.
- Make callback URLs configurable in the mock gateway instead of hardcoding port `5173`.

### Acceptance gate

- [ ] Changing `VITE_API_URL` is sufficient to point each frontend at another backend.
- [ ] No project-owned frontend source contains a hardcoded backend origin.
- [ ] Expired tokens lead to a predictable login flow.
- [ ] Lint/build succeed without unused or dead code.

## 3.9 P1 — Documentation reconciliation

### Documents needing correction

- `docs/GAP_ANALYSIS.md` still says many now-merged features are missing.
- `docs/WEEK1_MISSING_TASKS.md` calls populated blueprint files empty.
- `README.md` says web/scanner are not in Docker although Compose defines them.
- `blueprint/specs/payment.md` refers to nonexistent `POST /orders/:id/pay`.
- Check-in acceptance boxes are still unchecked and must not be checked until the real PWA journey is verified.
- Project layout and environment-variable documentation are incomplete.

### Implementation plan

1. Mark historical week guides as historical rather than deleting them.
2. Replace or archive the stale gap analysis and link this file as the current status.
3. Update every API path in specs to match controllers.
4. Add a requirements traceability table: requirement → implementation files → verification command/demo.
5. Document all environment variables without committing secrets.
6. Add exact demo runbooks for:
   - purchase and QR issue,
   - rate limiting,
   - circuit breaker,
   - idempotency,
   - oversell/per-user limit,
   - cache behavior,
   - scheduled CSV ingestion (inbox drop, not upload),
   - AI bio **with a configured real provider** — the fallback template must never be what is demonstrated,
   - reminder notification,
   - offline scanner and two-device conflict,
   - spike-profile load run.
7. Ensure Mermaid diagrams render and descriptions match final runtime behavior.

### Acceptance gate

- [ ] A reader finds no contradictory current-status claims.
- [ ] Every documented endpoint exists and uses the documented method/authentication.
- [ ] A clean-machine operator can reproduce every demo from README alone.
- [ ] No real API key, SMTP password, JWT secret, or private submission link is committed.

## 3.10 P1 — Submission artifacts

### Missing deliverables

- `clips/` contains no final MP4.
- No required `groupcode_mssv1_mssv2_mssv3.txt` submission-link file exists.
- No clean-machine verification record is present.
- Load-test evidence/screenshots have not been collected in a final evidence package.
- No load-test scenario reproduces the required traffic shape (80,000 users in 5 minutes, 70% in the first minute) — existing scripts prove individual mechanisms but not the spike profile.
- No captured proof of a real AI provider call exists; the AI-bio service silently falls back to a placeholder template when no API key is configured, and that fallback proves nothing.

### Implementation plan

1. Complete all P0 and P1 acceptance gates before recording.
2. Run a clean-machine rehearsal from a fresh clone and fresh Docker volumes.
3. Run each load-test script more than once on reset seed data.
4. Add and run `scripts/load-test/spike-profile.js`: a k6 ramping-arrival scenario mirroring the 70%-first-minute spike at a scaled-down user count (2,000–5,000 VUs is representative on a laptop; a literal 80k run is neither feasible locally nor literally required). Assert during the run that rate limiting engages, no ticket type oversells, browsing stays responsive via cache, and error responses are controlled 429/503s rather than crashes. Capture the k6 summary as evidence.
5. Capture an end-to-end real-AI proof: upload a sample PDF with `AI_PROVIDER` and its API key configured, capture backend logs showing the provider call, and screenshot the stored bio rendered on the concert detail page. Keep the fallback as resilience, but never on camera.
6. Capture results and database assertions, especially no negative stock and exactly one accepted double scan.
7. Record a 1080p MP4 with presenter camera and live demonstrations.
8. Verify target bitrate/size required by the course instructions.
9. Assemble the Drive folder with blueprint, source, data, README, and clips.
10. Enable public link access and test it in a signed-out/private browser session.
11. Create the correctly named `.txt` containing only the public link.

### Acceptance gate

- [ ] Fresh clone → one documented startup path → all services healthy.
- [ ] Three roles can log in and reach only their allowed functions.
- [ ] Full audience buy-to-QR journey succeeds.
- [ ] Organizer CRUD, stats, cancellation, CSV, and AI bio succeed.
- [ ] Scanner pre-download, offline scan, reconnect, and conflict demonstration succeed.
- [ ] All seven technical mechanisms are demonstrated with observable evidence.
- [ ] The spike-profile k6 run completes with rate limiting engaged, zero oversell, and its summary captured in the evidence package.
- [ ] The AI-bio demo shows a real provider call in the logs and the generated (non-fallback) bio on the concert page.
- [ ] Final video, Drive permissions, and submission filename meet the instructions exactly.

## 4. Recommended execution order

The work should be completed in dependency order rather than by UI/backend folder.

### Phase 0 — Stabilize the workspace (half day)

1. Run `npm ci` in all four Node packages.
2. Record clean build/test failures.
3. Fix stale order tests and current TypeScript errors.
4. Commit a green baseline before larger integration work.

**Exit gate:** backend, web, scanner, and mock gateway build; existing unit tests pass.

### Phase 1 — Make the primary demo journeys real (1–2 days)

1. Fix Compose mock-gateway URL.
2. Make mock payment the working default.
3. Add scanner authentication/API client/concert selection.
4. Replace scanner mock pre-download and sync.
5. Persist stable device ID.
6. Implement the guest outbound queue.

**Exit gate:** real buy-to-QR and real offline-scan-to-server journeys both work.

### Phase 2 — Close security and correctness gaps (1 day)

1. Enforce order ownership on fail.
2. Validate VNPay configuration, amount, and callback fields.
3. Protect/disable debug endpoints.
4. Add DTO validation and CORS allowlist.
5. Correct organizer revenue reporting.

**Exit gate:** negative authorization/payment tests pass; pending orders do not count as revenue.

### Phase 3 — Finish explicit feature requirements (1–1.5 days)

1. Add local mail service and QR e-ticket email.
2. Implement scheduled CSV inbox ingestion (§3.7 — required, not optional).
3. Complete PWA icons/offline packaging.
4. Write the spike-profile k6 scenario (§3.10 item 4) so Phase 5 only has to run it.
5. Add missing high-value tests.

**Exit gate:** email and scheduled-CSV acceptance criteria pass; PWA installs cleanly; spike scenario exists and runs locally.

### Phase 4 — Documentation and reproducibility (half to one day)

1. Reconcile README, blueprint specs, historical guides, and status documents.
2. Add environment examples and full demo runbooks.
3. Run fresh Docker rehearsal with no local `node_modules` assumptions.
4. Run the full build/test/load-test matrix.

**Exit gate:** another team member can reproduce every feature using only the repository documentation.

### Phase 5 — Evidence and submission (one day)

1. Capture final technical evidence, including the spike-profile k6 summary and the real-AI provider run.
2. Record and inspect the video.
3. Assemble and permission-check the Drive folder.
4. Create and validate the submission `.txt`.

**Exit gate:** final submission checklist is fully checked by at least two team members.

## 5. Suggested ownership split

| Workstream | Primary responsibility | Review responsibility |
|---|---|---|
| Scanner PWA integration | Frontend/PWA owner | Check-in backend owner |
| Docker/payment configuration | Infrastructure/payment owner | Commerce owner |
| Order/payment security | Commerce/auth owner | Independent reviewer |
| Tests and CI gate | Each feature owner | One integration owner |
| Email/e-ticket | Notifications owner | Audience-web owner |
| Revenue reporting | Admin/backend owner | Organizer-web owner |
| CSV scheduling | Ingestion owner | Infrastructure owner |
| Spike-profile load evidence + real-AI proof | Load-test/AI owner | Integration owner |
| Documentation/runbooks | Integration owner | Entire team |
| Video/submission | Named submission coordinator | Entire team |

No task should be marked complete only because code exists. The owner must supply the acceptance evidence, and a reviewer must reproduce the result.

## 6. Final definition of done

TicketBox is complete only when all of the following are true:

- [ ] All P0 and P1 acceptance gates in this document pass.
- [ ] No production/demo-critical path contains mock data or commented-out integration calls.
- [ ] Backend, web, scanner, and mock gateway build successfully from lockfiles.
- [ ] Unit/e2e/lint checks pass.
- [ ] Docker Compose starts the complete stack from a clean clone.
- [ ] Mock payment works by default; optional VNPay is either correctly configured or visibly disabled; the scope decision is stated in `blueprint/proposal.md`.
- [ ] Order access is owner-scoped, payment callbacks are fully validated, and an unconfigured VNPay secret can never fulfill an order.
- [ ] Purchase email includes usable e-ticket QR information.
- [ ] Admin revenue counts paid transactions rather than reserved inventory.
- [ ] Scanner uses real authenticated data and synchronization, including offline VIP handling.
- [ ] A CSV dropped into the mounted inbox is imported on schedule without any HTTP upload.
- [ ] The AI-bio flow has been demonstrated end-to-end against a real configured provider, not the fallback template.
- [ ] The spike-profile load scenario has been run with captured evidence (rate limiting engaged, zero oversell, browsing responsive).
- [ ] Documentation matches the final implementation and contains no stale “missing/unmerged” claims.
- [ ] All seven technical mechanisms have repeatable evidence.
- [ ] The clean-machine rehearsal, final video, public Drive folder, and submission `.txt` are complete.

## 7. Deferred enhancements

The following ideas from `plan.md` are valuable but should remain out of the critical path until the definition of done above is satisfied:

- Virtual waiting room.
- Prometheus/Grafana observability dashboard.
- Multi-instance backend behind a load balancer.
- Transactional outbox.
- Full-scale 80,000-VU performance report on cloud infrastructure. (The scaled-down spike-profile scenario in §3.10 is **required** and not deferred; only the literal full-scale run is.)
- Real VNPay sandbox end-to-end certification and MoMo integration. (Optional VNPay sandbox support stays in scope as configured-only; the scope decision lives in `blueprint/proposal.md`.)
- Production cloud deployment.
- Native mobile scanner.
- Per-seat assignment.

These are enhancements, not substitutes for finishing the required integrated journeys.
