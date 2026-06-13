/*
  Warnings:

  - The `syncStatus` column on the `CheckinLog` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `CsvImportBatch` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `GuestListEntry` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Notification` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `concertId` to the `CsvImportBatch` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCED', 'ACCEPTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PROCESSING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "GuestStatus" AS ENUM ('INVITED', 'CHECKED_IN');

-- DropForeignKey
ALTER TABLE "GuestListEntry" DROP CONSTRAINT "GuestListEntry_concertId_fkey";

-- DropIndex
DROP INDEX "Order_userId_idx";

-- AlterTable
ALTER TABLE "CheckinLog" DROP COLUMN "syncStatus",
ADD COLUMN     "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "CsvImportBatch" ADD COLUMN     "concertId" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "ImportStatus" NOT NULL DEFAULT 'PROCESSING';

-- AlterTable
ALTER TABLE "GuestListEntry" DROP COLUMN "status",
ADD COLUMN     "status" "GuestStatus" NOT NULL DEFAULT 'INVITED';

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "status",
ADD COLUMN     "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_ticketTypeId_idx" ON "OrderItem"("ticketTypeId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_checkedInBy_fkey" FOREIGN KEY ("checkedInBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestListEntry" ADD CONSTRAINT "GuestListEntry_concertId_fkey" FOREIGN KEY ("concertId") REFERENCES "Concert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsvImportBatch" ADD CONSTRAINT "CsvImportBatch_concertId_fkey" FOREIGN KEY ("concertId") REFERENCES "Concert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
