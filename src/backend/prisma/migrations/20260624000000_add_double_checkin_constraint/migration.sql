-- Option A: enforce a ticket can only be flipped to USED once.
-- This is a declarative backstop to the atomic conditional VALID -> USED flip
-- in the check-in sync flow (see checkin.service.ts syncBatch).
-- CheckinLog intentionally has NO unique on ticketId so rejected duplicate
-- scans are still appended for audit / 2-device-offline demo.
CREATE UNIQUE INDEX "one_checkin_per_ticket"
  ON "Ticket" ("id")
  WHERE status = 'USED';
