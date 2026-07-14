ALTER TABLE "TicketType" ADD COLUMN "zoneKey" TEXT;

-- Backfill data: zoneKey = name
UPDATE "TicketType" SET "zoneKey" = "name";

-- Create unique index
CREATE UNIQUE INDEX "TicketType_concertId_zoneKey_key" ON "TicketType"("concertId", "zoneKey");
