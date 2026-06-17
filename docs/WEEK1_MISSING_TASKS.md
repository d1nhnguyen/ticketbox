# TicketBox — Week 1 Missing Tasks

> Gap list from auditing the repo against [WEEK1_GUIDE.md](WEEK1_GUIDE.md).
> Core engineering (schema, auth, read APIs, mock gateway, frontend) is done.
> These are the items still blocking the **Day 5 acceptance gate**.

**Legend:** 🔴 blocking · 🟡 required by guide · ⚪ minor / nice-to-have

---

## ✅ BLOCKER RESOLVED — `docker-compose up` now migrates + seeds

Owner: **B** (with A) · verified live on a clean volume

- [x] Added [docker-entrypoint.sh](../src/backend/docker-entrypoint.sh): runs
      `prisma migrate deploy` → seed → `node dist/main.js`; wired as the backend `ENTRYPOINT`.
- [x] Made the seed idempotent ([seed.ts](../src/backend/prisma/seed.ts)) — skips if already
      seeded so restarts don't wipe demo data (`FORCE_SEED=1` to force a re-seed).
- [x] Added [.dockerignore](../src/backend/.dockerignore) so the host's Windows `node_modules`
      no longer clobbers the Alpine Prisma client in the image (also for mock-gateway).
- [x] Fixed the build-output path (`dist/main.js`, not `dist/src/main.js`) in the entrypoint
      and `start:prod`.

**Verified:** `docker compose down -v && docker compose up -d --build` → migrations apply →
4 concerts + 3 users seed → `GET /concerts` returns all 4 concerts, zero manual steps.
Restart re-run logs "Database already seeded — skipping".

---

## PERSON A — Backend Core

### A1a. Double check-in partial unique index 🟡

The guide's Option B was chosen in the schema comment but the raw migration was never written.

- [ ] Add a migration creating the partial unique index:
      ```sql
      CREATE UNIQUE INDEX one_accepted_checkin_per_ticket
        ON "CheckinLog" ("ticketId")
        WHERE "syncStatus" = 'ACCEPTED';
      ```
- [ ] Document the decision (Option A vs B + rationale) in [specs/checkin.md](../blueprint/specs/checkin.md) (currently empty) — settle with C.

### A1b. Reservation (hold) model spec 🟡

- [ ] Fill in [specs/purchase.md](../blueprint/specs/purchase.md) (currently empty) with the
      PENDING-decrements-stock / `expiresAt = now+10min` / BullMQ sweep-back model — settle with B.

### A3. Document seed passwords in README 🟡

Passwords exist in [users.json](../data/seed/users.json) but the guide requires them in the README so graders can log in.

- [ ] Add the 3 seed accounts (email + plaintext password + role) to [README.md](../README.md).

### A4. Concert read API polish ⚪

- [ ] Include `seatMapSvg` in the `GET /concerts/:slug` detail select ([concerts.service.ts](../src/backend/src/concerts/concerts.service.ts)).
- [ ] Add `@nestjs/swagger` annotations + wire `SwaggerModule` in `main.ts` so the contract is browsable.

---

## PERSON B — Infra & Integrations

### B2. Validate required env vars on boot -  DONE

`ConfigModule.forRoot` has no schema ([app.module.ts](../src/backend/src/app.module.ts)).

- Added [`src/config/env.validation.ts`](../src/backend/src/config/env.validation.ts) — Joi schema

- **Verified fail-fast:** boot with `JWT_SECRET=""` → immediate crash with
      `Error: Config validation error: JWT_SECRET must be at least 15 characters long`.

---

## PERSON C — Frontend & PWA

### C2a. SCANNER redirect 404s ⚪

Login routes `SCANNER` to `/scanner`, which has no route in the web app ([App.tsx](../src/web/src/App.tsx)).

- [ ] Either point SCANNER logins at the separate scanner app URL, or add a placeholder `/scanner` route in web.

### C2b. Remove dead code ⚪

[App.tsx](../src/web/src/App.tsx) redefines `AuthProvider` / `ProtectedRoute` / pages inline, leaving the standalone files unused.

- [ ] Delete or actually wire up [hooks/useAuth.tsx](../src/web/src/hooks/useAuth.tsx),
      [components/ProtectedRoute.tsx](../src/web/src/components/ProtectedRoute.tsx), and the `pages/*` files.

---

## Blueprint (empty files to fill) 🟡

- [ ] [proposal.md](../blueprint/proposal.md) — problem, goals, scope, risks (empty)
- [ ] [specs/checkin.md](../blueprint/specs/checkin.md) — owned by C (empty; see A1a)
- [ ] [specs/purchase.md](../blueprint/specs/purchase.md) — owned by A (empty; see A1b)

Each spec needs: **Description / Main flow / Error scenarios / Constraints / Acceptance criteria.**

---

## Re-run the Day 5 gate after these land

1. `docker-compose up` on a clean checkout — no manual steps.
2. 4 concerts appear (seeded automatically).
3. Log in via web as AUDIENCE / ORGANIZER / SCANNER — each lands on the right area.
4. Concert list + detail render from the live API.
5. Blueprint diagrams render on GitHub; all specs drafted (none empty).
