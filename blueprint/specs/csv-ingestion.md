# CSV Ingestion Spec

## 1. Description
A resilient component that parses VIP guest list CSV files for concerts. It ensures that duplicate rows are updated or ignored gracefully, parsing failures are isolated to the specific row without failing the entire batch, and duplicate file content triggers an immediate checksum-based skip — whether the file arrives via a scheduled drop-folder or an interactive upload.

## 2. Architecture Decision Record (ADR): Scheduled Inbox + Upload, One Shared Pipeline
- **Context**: The assignment requires guest lists to be ingested *periodically* ("định kỳ nhập"), not only on manual admin action.
- **Decision**: A `InboxPollerService` (`@Cron(EVERY_10_SECONDS)`, in the `guests` module) polls a mounted directory (`CSV_INBOX_DIR`, default `/data/inbox`, bind-mounted from `./data/inbox` in `docker-compose.yml`) and feeds new files into the **same** ingest core (`GuestsService.ingestBuffer`) used by the existing interactive upload endpoint (`POST /admin/concerts/:concertId/guests/upload`). Both paths converge on identical checksum dedup, `CsvImportBatch` bookkeeping, and the unmodified `GuestsProcessor` BullMQ worker.
- **Why**:
  - Satisfies "định kỳ nhập" without giving up the organizer's ability to upload and see status immediately from the Admin UI — the upload endpoint stays as the interactive/on-demand path.
  - Reusing `ingestBuffer` means the file's origin (inbox vs. multipart upload) is irrelevant past the point the bytes are read — no duplicated checksum/queue logic to keep in sync.
  - The poller only decides *where files end up on disk*; it never touches CSV parsing or row validation, so the well-tested `GuestsProcessor` worker needed zero changes.
- **Concert association convention**: inbox files are named `<concert-slug>__anything.csv` (slug = the part before the first `__`, or the whole basename if there's no `__`). This is a filename convention, not a per-concert subfolder, matching "no distributed file watcher or object storage" scope constraint.
- **Consequences**: two ingestion entry points, one pipeline. No cron job runs the parsing itself — the cron only discovers files and calls the same service method the controller calls.

## 3. Main Flow

### 3a. Scheduled inbox (primary, periodic path)
1. A CSV file is dropped (copied) into `data/inbox/` on the host, named `<concert-slug>__anything.csv`.
2. Within 10s, `InboxPollerService.poll()` (re-entrancy-guarded, single in-flight tick) lists the directory, skipping dotfiles and any file modified in the last 3s (still being copied).
3. Resolve the concert by slug first — unknown slug moves the file to `data/inbox/failed/`. For a known concert, hash the file and look up `CsvImportBatch` by the composite key `(concertId, checksum)`, then call `GuestsService.ingestBuffer(concertId, filename, buffer)` when it is new. The original inbox file is left in place while the worker runs.
4. On the next tick(s), the poller re-hashes the file and looks up its batch by checksum: `PROCESSING` → leave it (worker still running / retrying); `SUCCESS` → sweep to `data/inbox/processed/`; `FAILED` → sweep to `data/inbox/failed/`. This makes outcome visible on disk without the poller needing to know about BullMQ job state directly.
5. Re-copying identical file content for the same concert (even under a different filename) resolves to the same composite key, so it is swept straight to `processed/` without creating duplicate rows. The same bytes may legitimately be imported for another concert.

### 3b. Interactive upload (secondary, on-demand path)
1. **Upload**: Organizer uploads a CSV file via `POST /admin/concerts/:concertId/guests/upload` on the Admin UI.
2. **Enqueue**: `GuestsService.uploadCsv` verifies the concert exists, then delegates to the same `ingestBuffer` core described above.
3. **Deduplication (File Level)**: If the checksum already has a `CsvImportBatch`, the upload is rejected immediately (`409 Conflict`).

### 3c. Shared worker (both paths)
4. **Parsing**: `GuestsProcessor` (`@Processor('guests')`) picks up the `guests.import` job and streams the CSV file (`csv-parser`), unaware of whether it originated from the inbox or an upload.
5. **Validation & Insertion**:
   - Each row requires `fullName` and `zone`; `docId` is optional. Missing either fails just that row.
   - In-file dedup (by `docId`, or by `fullName` when `docId` is absent) via in-memory Sets, then cross-batch DB dedup by querying existing `GuestListEntry` rows for the concert.
   - Bulk insert via `guestListEntry.createMany({ skipDuplicates: true })`, tagged with `sourceBatchId`.
6. **Completion**: `CsvImportBatch` updated to `SUCCESS` (with `rowsTotal`/`rowsOk`/`rowsFailed`) or, after the final BullMQ retry attempt, `FAILED`. The temp file under `uploads/` is removed either way.

## 4. Error Scenarios
- **Duplicate content for one concert**: Skipped via the pre-check + DB composite unique constraint on `(concertId, checksum)`; inbox variant sweeps the file straight to `processed/`, upload variant returns `409 Conflict`.
- **Corrupt/Invalid row (e.g., missing name or zone)**: Increments `rowsFailed` for the batch, logs a warning, processor continues to the next row — valid rows in the same file still import.
- **Malformed file / wrong schema**: The worker requires `fullName` and `zone` headers. Missing headers destroy the parser stream with an error; BullMQ retries up to 3 times (exponential backoff), then marks the batch `FAILED` and removes its temp file. The poller subsequently sweeps the inbox file to `failed/` without crashing the backend.
- **Temp-file or enqueue failure**: `ingestBuffer` removes any temp file and changes the newly-created batch from `PROCESSING` to `FAILED` before returning the error, so the checksum never leaves a permanently stuck batch.
- **Unknown concert slug in inbox filename**: The poller cannot resolve a concert, so it moves the file straight to `data/inbox/failed/` without ever creating a batch.
- **Non-`.csv` file dropped in the inbox**: Moved straight to `failed/` on sight.
- **Worker crash mid-processing**: If the server dies mid-processing, BullMQ retries the job on restart; checksum uniqueness means a re-attempt is safe (no double `CsvImportBatch`).

## 5. Constraints
- **Memory model**: The worker parses with `fs.createReadStream` and `csv-parser`; the current inbox/upload gateway buffers the file once to calculate SHA-256 and persist the BullMQ temp file. Guest-list files are expected to be small in this project scope; production deployment should add an explicit upload-size limit or streaming hash pipeline.
- **Database Limits**: Use `Prisma.guestListEntry.createMany` with `skipDuplicates: true` or process rows sequentially if complex validation is needed.
- **No distributed file watcher or object storage**: a single-instance polling cron with a boolean re-entrancy guard is sufficient for this scope; the inbox directory is a plain bind mount (`./data/inbox`), not S3/GCS or a `chokidar`-style filesystem watcher.

## 6. Acceptance Criteria
- Copying a valid CSV named `<slug>__anything.csv` into `data/inbox/` — without calling the upload API — creates the guest list for that concert within one poll interval, and the file is swept to `processed/`.
- A CSV with formatting errors in some rows still imports the valid rows; `rowsFailed` reflects the bad ones.
- Dropping the exact same file content again for the same concert (any filename) is skipped as a duplicate and swept to `processed/`; identical content for another concert remains importable.
- A malformed/non-CSV file does not crash the worker or backend process, and ends up in `failed/`.
- An inbox file naming an unknown concert slug is moved to `failed/` without side effects.
- Uploading a valid CSV via the Admin UI still imports successfully and displays the guest list (interactive path unaffected).
- Re-uploading the exact same CSV via the Admin UI still returns a `409 Conflict` (Checksum duplicate).
