-- AlterTable
ALTER TABLE "Concert" ADD COLUMN "artists" TEXT[] NOT NULL DEFAULT '{}';
