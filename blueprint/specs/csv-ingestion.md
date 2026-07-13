# CSV Ingestion Spec

## 1. Description
A resilient component that parses VIP guest list CSV files for concerts. It ensures that duplicate rows are updated or ignored gracefully, parsing failures are isolated to the specific row without failing the entire batch, and duplicate file uploads trigger an immediate checksum-based rejection.

## 2. Architecture Decision Record (ADR): Upload-Triggered vs Drop-Folder Cron
- **Context**: The original requirement specified periodic CSV parsing (e.g., a cron job checking a drop folder).
- **Decision**: We opted for an **upload-triggered BullMQ background job** initiated via the Admin Dashboard UI.
- **Why**: 
  - Allows organizers to upload and immediately see the processing status on the UI without waiting for a nightly cron.
  - Checksum deduplication naturally protects against double-clicks or re-uploads of the same file.
  - The heavy lifting (parsing, inserting) is still done entirely in the background (BullMQ), adhering to the requirement that ingestion does not block the main event loop.
- **Consequences**: No cron job is required for CSV ingestion.

## 3. Main Flow
1. **Upload**: Organizer uploads a CSV file via `POST /guests/import/:concertId` on the Admin UI.
2. **Enqueue**: The controller calculates the file's SHA-256 checksum, creates a `CsvImportBatch` record in `PROCESSING` state, and enqueues a job to BullMQ (`guests` queue).
3. **Deduplication (File Level)**: If the checksum already exists for a successful batch for this concert, the upload is rejected immediately (`409 Conflict`).
4. **Parsing**: The `GuestsProcessor` picks up the job and streams the CSV file (using `csv-parser`).
5. **Validation & Insertion**:
   - Each row is validated.
   - Upsert into `GuestListEntry` utilizing the DB constraints `@@unique([concertId, docId, sourceBatchId])`.
   - Since PostgreSQL treats NULL `docId`s as distinct, NULL-safe deduplication is handled in the application layer (finding by `name` + `phone` or skipping duplicates).
6. **Completion**: Update `CsvImportBatch` with `SUCCESS` or `FAILED`, logging total successful and failed rows.

## 4. Error Scenarios
- **Duplicate row in DB**: Ignored via `skipDuplicates` or upserted without throwing an error.
- **Corrupt/Invalid row (e.g., missing name)**: Increments the `failedCount` for the batch, logs the error, but the processor continues to the next row safely.
- **Worker Crash**: If the server dies mid-processing, BullMQ will retry the job upon restart. Checksum uniqueness ensures partial data can be safely re-upserted.

## 5. Constraints
- **Memory Efficiency**: Do not load the entire CSV into RAM. Use Node.js streaming APIs (`fs.createReadStream` piped to `csv-parser`).
- **Database Limits**: Use `Prisma.guestListEntry.createMany` with `skipDuplicates: true` or process rows sequentially if complex validation is needed.

## 6. Acceptance Criteria
- Uploading a valid CSV imports successfully and displays the guest list in the Admin UI.
- Uploading a CSV with formatting errors logs failures for bad rows but succeeds for valid rows.
- Re-uploading the exact same CSV returns a `409 Conflict` (Checksum duplicate).
