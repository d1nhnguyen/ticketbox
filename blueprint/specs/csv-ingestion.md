# CSV Ingestion Spec

## Description
A resilient component that schedules and parses guest list CSVs. Ensures that duplicate rows are updated/ignored, failures are isolated to the row, and duplicate file uploads trigger a checksum reject.

## Main Flow
1. File uploaded to server, stored initially.
2. Background cron job picks up the CSV.
3. Calculate file checksum. If exists in `CsvImportBatch` as completed, skip.
4. Parse rows: insert/update `GuestListEntry` utilizing DB constraints.

## Error Scenarios
- **Duplicate row**: Skipped or upserted without throwing.
- **Corrupt row**: Logged as failure in the batch record, but next row parses fine.
- **Duplicate file**: Terminated immediately without reading row-by-row.

## Constraints
- Do not keep the entire CSV in RAM (use streaming parse).
- Upsert must rely on `unique([concertId, docId, sourceBatchId])`.

## Acceptance Criteria
- Uploading `guests-valid.csv` imports successfully.
- Uploading `guests-with-errors.csv` logs failures but succeeds remaining valid rows.
- Re-uploading `guests-valid.csv` skips entirely due to checksum.
