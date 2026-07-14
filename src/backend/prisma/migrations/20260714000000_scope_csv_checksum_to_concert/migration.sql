DROP INDEX "CsvImportBatch_checksum_key";

CREATE UNIQUE INDEX "CsvImportBatch_concertId_checksum_key"
ON "CsvImportBatch"("concertId", "checksum");
