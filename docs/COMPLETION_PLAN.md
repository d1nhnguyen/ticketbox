# TicketBox — Completion Plan cho đồ án môn học

> **Cập nhật:** 2026-07-14
>
> **Nguồn phạm vi:** `requirements.md` và rubric chấm điểm `BP01–BP15`, `IM01–IM18`.
>
> **Mục tiêu:** hoàn thành đúng chức năng, cơ chế kỹ thuật, tài liệu và hồ sơ nộp bài; không mở rộng thành kế hoạch production.

## 1. Nguyên tắc phạm vi

Một hạng mục chỉ nằm trong critical path khi thỏa một trong ba điều kiện:

1. được yêu cầu trực tiếp trong `requirements.md` hoặc rubric `BP01–BP15`, `IM01–IM18`;
2. cần để chạy và demo một yêu cầu trực tiếp;
3. cần cho đúng cấu trúc bài nộp.

Không yêu cầu production certification. Các nội dung như TLS, cloud deployment, backup, monitoring dashboard, multi-region, zero lint toàn repository hoặc full-scale 80.000 user không phải điều kiện hoàn thành đồ án.

Rubric vẫn yêu cầu **thiết kế và chứng minh cơ chế** cho tải 80.000 người/5 phút với 70% ở phút đầu. Không cần tạo tải cloud-scale thật, nhưng phải có capacity reasoning, code rate limiting/bot-fairness và demo quy mô phù hợp.

### Mức ưu tiên

| Mức | Ý nghĩa |
|---|---|
| `MUST` | Yêu cầu trực tiếp của đề hoặc blocker của demo chính. |
| `SHOULD` | Cải thiện độ ổn định/trình bày nếu còn thời gian. |
| `OPTIONAL` | Không ảnh hưởng completion; chỉ làm sau khi `MUST` hoàn tất. |

### Quy ước trạng thái rubric

| Trạng thái | Ý nghĩa |
|---|---|
| `DONE` | Tài liệu/code đã có và bằng chứng hiện tại đủ cho tiêu chí. |
| `PARTIAL` | Đã có phần chính nhưng còn thiếu nội dung, test runtime hoặc evidence. |
| `MISSING` | Chưa có implementation bắt buộc hoặc tài liệu đang mâu thuẫn với rubric. |

### Ma trận truy vết Blueprint

| Mã | Trạng thái | Bằng chứng hiện tại | Việc còn lại |
|---|---|---|---|
| BP01 | `DONE` | `blueprint/design.md` §1, §4 | Rà lại failure-impact table với runtime cuối. |
| BP02 | `DONE` | C4 Context có Audience, Organizer, Scanner, payment, AI và CSV source. | Render sơ đồ trước khi nộp. |
| BP03 | `DONE` | C4 Container có web, Scanner PWA, API, worker, PostgreSQL, Redis và mock gateway. | Ghi rõ Scanner PWA là mobile implementation của rubric. |
| BP04 | `PARTIAL` | Runtime diagram có payment và offline path. | Bổ sung AI/PDF, scheduled CSV inbox/worker, email và các giao tiếp chính vào high-level diagram. |
| BP05 | `DONE` | `blueprint/design.md` §2 và Prisma schema. | Đối chiếu ERD với schema cuối. |
| BP06 | `PARTIAL` | `specs/purchase.md`, `specs/payment.md`, `specs/notifications.md`. | Thêm một sequence end-to-end từ click mua đến QR/app/email, gồm timeout, fail, expiry và email retry. |
| BP07 | `DONE` | `specs/checkin.md` có preload, IndexedDB, offline scan, sync và two-device conflict. | Gắn screenshot/video acceptance sau khi chạy thật. |
| BP08 | `DONE` | `specs/csv-ingestion.md` viết lại ADR (scheduled inbox + upload dùng chung pipeline), main flow, error scenarios, acceptance criteria; `design.md` ADR 4 cập nhật. `InboxPollerService` (`@Cron` 10s) triển khai thật ngày 2026-07-14. | Render sơ đồ high-level cập nhật CSV inbox trong BP04 (§4.7). |
| BP09 | `DONE` | `design.md` §3 và guards/decorators theo ba role. | Chạy role matrix làm evidence. |
| BP10 | `PARTIAL` | Redis token bucket và load-test script đã có. | Ghi capacity reasoning 80.000/5 phút, 70% phút đầu (~933 req/s), key strategy và bot-fairness/degradation `429`. |
| BP11 | `PARTIAL` | Opossum circuit breaker và failure section đã có. | Mô tả rõ browsing vẫn chạy, payment trả `503`, order retry được và hard failure hoàn kho đúng một lần. |
| BP12 | `DONE` | Redis `Idempotency-Key`, DB unique key và gateway replay guard. | Chạy demo cùng key không tạo order/charge thứ hai. |
| BP13 | `DONE` | Cache-aside TTL 120s/60s và invalidation. | Chạy HIT/MISS/invalidation evidence. |
| BP14 | `DONE` | ADR trong `design.md` và các feature spec. | Cập nhật ADR CSV sau khi scheduler được cài. |
| BP15 | `DONE` | Có `proposal.md`, `design.md` và `specs/*.md`. | Kiểm tra link/sơ đồ render không lỗi. |

### Ma trận truy vết cài đặt

| Mã | Trạng thái | Bằng chứng hiện tại | Việc còn lại |
|---|---|---|---|
| IM01 | `DONE` | List/detail, venue, polling availability, seed `artists`/`seatMapSvg` thật và sơ đồ SVG tương tác theo `data-zone` (click chọn vé, sold-out/locked đổi màu, sanitize XSS) ngày 2026-07-14. | Gắn screenshot/video acceptance sau khi chạy thật. |
| IM02 | `DONE` | Purchase, mock payment, ticket issuance và QR trong web/email. | Giữ một evidence buy-to-QR-email. |
| IM03 | `PARTIAL` | Per-user limit tính PAID + PENDING trong transaction. | Chạy concurrency script và lưu assertion. |
| IM04 | `PARTIAL` | App/email e-ticket đã E2E pass; reminder cron có code. | Chạy reminder khoảng 24h và lưu evidence. |
| IM05 | `PARTIAL` | CRUD/cancel/ticket types/paid stats API và UI đã có. | Chạy organizer journey từ UI. |
| IM06 | `PARTIAL` | API guards, admin protected routes và Scanner role check đã có. | Chạy role matrix cho cả API/web/scanner. |
| IM07 | `PARTIAL` | Scanner PWA có camera QR và xác nhận tại cổng. | Xác nhận rubric chấp nhận PWA là mobile app và quay demo trên mobile viewport/device. |
| IM08 | `PARTIAL` | IndexedDB queues, service worker, reconnect sync và atomic double-scan guard đã có. | Chạy offline/reload/two-profile acceptance. |
| IM09 | `PARTIAL` | PDF parsing, cleaning, ba provider và fallback đã có. | Chạy ít nhất một provider thật, không lộ key. |
| IM10 | `DONE` | Upload CSV, BullMQ worker và `InboxPollerService` (poll `/data/inbox` mỗi 10s, sweep `processed/`/`failed/`, dùng chung `ingestBuffer` với upload) đã chạy thật và verify ngày 2026-07-14 (valid/duplicate/row-error/malformed/unknown-slug). | Gắn evidence vào video demo. |
| IM11 | `PARTIAL` | Atomic stock decrement và oversell script đã có. | Chạy demo, chứng minh success ≤ stock và remaining không âm. |
| IM12 | `PARTIAL` | Global Redis token bucket và route-specific limits đã có. | Bổ sung bot-fairness/capacity reasoning và demo `429`. |
| IM13 | `PARTIAL` | Circuit breaker/fallback `503` đã cài thật. | Demo OPEN/HALF_OPEN/CLOSED và browsing không bị ảnh hưởng. |
| IM14 | `PARTIAL` | Redis + DB + gateway idempotency đã cài thật. | Chạy duplicate/retry evidence. |
| IM15 | `PARTIAL` | Cache TTL/invalidation đã cài thật. | Chạy cache evidence. |
| IM16 | `PARTIAL` | README có Docker quick start, seed accounts và demo guides. | Sửa đường dẫn/tên sample CSV và chạy lại từ máy/trạng thái sạch. |
| IM17 | `DONE` | Seed có 4 concert, ticket types, giá, `artists` (7–8 nghệ sĩ/concert) và `seatMapSvg` (5 zone SVIP/VIP/CAT1/CAT2/GA). Xác nhận fresh seed qua `down -v && up --build` ngày 2026-07-14. | — |
| IM18 | `PARTIAL` | Full Compose 7 service đã build và healthy ngày 2026-07-14. | Demo toàn bộ theo Blueprint từ volume sạch và lưu evidence/video. |

## 2. Definition of Done tối giản

TicketBox được xem là hoàn thành khi:

- [ ] Một người mới có thể chạy hệ thống theo README và thấy dữ liệu seed.
- [ ] Ba vai trò đăng nhập và chỉ dùng đúng chức năng của mình.
- [x] Audience xem concert, nghệ sĩ, sơ đồ SVG từ seed, số vé; mua vé và nhận QR.
- [ ] Organizer quản lý concert/ticket type, hủy concert và xem doanh thu đã thanh toán.
- [x] Purchase notification xuất hiện trong app và email có e-ticket.
- [ ] Reminder trước concert khoảng 24 giờ hoạt động.
- [ ] Scanner tải dữ liệu, scan offline và đồng bộ lại; một vé không được accepted hai lần.
- [ ] AI bio xử lý PDF và đã được demo ít nhất một lần với provider thật.
- [x] CSV guest list được nhập định kỳ, xử lý file lỗi và dữ liệu trùng.
- [ ] Bảy vấn đề kỹ thuật trong đề có code thật và demo/bằng chứng quy mô phù hợp.
- [ ] Toàn bộ BP01–BP15 và IM01–IM18 đạt `DONE` hoặc có ghi chú chấp nhận rõ cho mục khuyến nghị.
- [ ] Blueprint, source/data/README và video đáp ứng cấu trúc nộp bài.

## 3. Trạng thái hiện tại

### 3.1 Đã có trong code

- [x] Bốn concert seed đúng tên đề bài, ticket types, giá, `artists` và `seatMapSvg`, ba tài khoản role.
- [x] JWT authentication và RBAC `AUDIENCE`, `ORGANIZER`, `SCANNER`.
- [x] Concert list/detail, SVG zone map (seed tương tác qua `data-zone`, sanitize XSS, fallback auto-layout) và polling số vé còn lại.
- [x] Atomic inventory reservation, chống oversell và per-user limit.
- [x] Redis idempotency, token-bucket rate limiting và cache-aside.
- [x] Mock payment gateway, circuit breaker và QR ticket issuance.
- [x] VNPay optional có validation chữ ký và amount; MoMo được scope out trong proposal.
- [x] In-app purchase/cancellation notification và reminder cron.
- [x] Mailpit local, SMTP notification retry và email purchase có QR e-ticket cho từng vé.
- [x] Organizer concert/ticket CRUD, cancellation và paid stats API.
- [x] Dashboard/AdminConcertDetail dùng paid stats API cho doanh thu và số vé đã bán.
- [x] CSV upload, checksum dedup, row-level validation, BullMQ worker và scheduled inbox poller (`InboxPollerService`, `data/inbox/` → `processed/`/`failed/`).
- [x] PDF extraction, AI provider selection và fallback.
- [x] Scanner login, real pre-download, IndexedDB queues, offline sync và server double-scan guard.
- [x] Docker Compose cho Postgres, Redis, Mailpit, backend, mock gateway, web và scanner; full build 7 service đã healthy.
- [x] Blueprint proposal/design/specs và các sơ đồ chính.

### 3.2 Cần hoàn thành hoặc kiểm chứng thêm

| Hạng mục | Loại | Trạng thái |
|---|---|---|
| Manual browser scanner journey | `MUST` | Code có, chưa chạy đủ offline/reload/two-device. |
| Real AI demonstration | `MUST` | Code provider có; cần key và bằng chứng một lần chạy thật. |
| Blueprint BP04/BP06/BP10/BP11 | `MUST` | Cần bổ sung high-level diagram, purchase E2E, capacity reasoning và graceful degradation. |
| VNPay currency validation | `SHOULD` | Optional path còn 1 unit test fail vì currency check đang bị tắt; sửa trước khi chốt full test. |
| Technical-mechanism demo | `MUST` | Scripts phần lớn có; cần chạy và lưu output gọn. |
| README/blueprint consistency | `MUST` | Cần một lượt đối chiếu cuối. |
| Video, Drive và submission `.txt` | `MUST` | Làm sau khi các journey chính pass. |
| Security hardening ngoài RBAC/idempotency | `SHOULD` | Các fix chính đã có; không cần mở rộng thành security audit. |
| Dọn toàn bộ lint debt | `SHOULD` | Chỉ sửa lỗi làm build/test hoặc demo thất bại. |

## 4. Kế hoạch công việc còn lại

## 4.1 Scanner offline acceptance (`MUST`)

Code integration đã hoàn thành. Việc còn lại là chạy browser test thật:

1. Login bằng Scanner; xác nhận Audience/Organizer bị từ chối.
2. Chọn concert và tải real tickets/guests.
3. Chuyển DevTools Offline và reload PWA.
4. Scan QR hợp lệ; scan lại trên cùng máy phải bị chặn.
5. Reload để xác nhận pending scan không mất.
6. Online trở lại; pending scan tự sync.
7. Dùng hai browser profile scan cùng QR khi offline; sau sync chỉ một `ACCEPTED`, một `DUPLICATE`.
8. Test VIP guest offline rồi sync.

**Hoàn thành khi:** toàn bộ luồng trên chạy được một lần và có screenshot/video. Không yêu cầu test trên nhiều hệ điều hành hoặc thiết bị vật lý khác nhau.

## 4.2 Email xác nhận có e-ticket (`MUST`)

**Trạng thái:** hoàn thành và đã kiểm chứng end-to-end với mock purchase + Mailpit local ngày 2026-07-14.

Yêu cầu đề bài: mua thành công phải có thông báo app và email kèm e-ticket.

- [x] Thêm Mailpit vào Compose; inbox local tại `http://localhost:8025`.
- [x] Cấu hình backend gửi SMTP tới `mailpit:1025`.
- [x] Email hiển thị user, concert, ticket type và QR PNG inline của từng ticket.
- [x] Giữ kiến trúc `NotificationChannel` hiện tại để có thể thêm SMS/Zalo sau này.
- [x] Khi email lỗi, log rõ, throw về worker và BullMQ retry tối đa ba lần với exponential backoff.

**Hoàn thành khi:** một mock purchase tạo in-app notification và một email local có QR đọc được.

Không cần delivery dashboard, exactly-once email hoặc SMTP production audit.

## 4.3 Organizer revenue đúng (`MUST`)

**Trạng thái:** implementation hoàn thành; targeted stats test và web build đã pass ngày 2026-07-14. Organizer UI journey vẫn nằm trong kiểm chứng IM05.

- [x] Dashboard/AdminConcertDetail dùng `GET /admin/concerts/:id/stats`.
- [x] Revenue và sold tickets chỉ tính order `PAID`.
- [x] Availability tiếp tục phản ánh reservation `PENDING` qua `remainingQty`.
- [x] Test khóa điều kiện aggregate/query chỉ lấy `PAID`.

**Hoàn thành khi:** PENDING làm giảm availability nhưng không tăng doanh thu; confirm tăng doanh thu đúng một lần; fail/expiry không được tính.

## 4.4 Scheduled CSV guest ingestion (`MUST`) — `DONE` (2026-07-14)

Đề yêu cầu "định kỳ nhập" CSV, nên upload-only chưa đủ.

- [x] Mount một inbox tại `/data/inbox` (`docker-compose.yml` bind-mount `./data:/data` đã có sẵn; thêm `CSV_INBOX_DIR=/data/inbox`).
- [x] `InboxPollerService` (`@Cron(EVERY_10_SECONDS)`, module `guests`) poll định kỳ và đưa file mới vào pipeline CSV hiện có qua `GuestsService.ingestBuffer` (core dùng chung với endpoint upload, `GuestsProcessor` không đổi).
- [x] Dùng composite checksum (`@@unique([concertId, checksum])`) để bỏ qua nội dung trùng trong cùng concert — file trùng nội dung được sweep vào `processed/`, nhưng cùng nội dung vẫn có thể nhập cho concert khác.
- [x] File có row lỗi vẫn nhập row hợp lệ (`rowsFailed` tăng riêng, không chặn `rowsOk`).
- [x] File malformed/sai schema không làm worker/backend crash — worker bắt buộc header `fullName` và `zone`, retry BullMQ rồi đánh dấu batch `FAILED`; poller sweep file vào `failed/`.
- [x] Lỗi ghi temp file/enqueue không để batch treo `PROCESSING`: temp file được dọn và batch được chuyển sang `FAILED` trước khi trả lỗi.
- [x] Di chuyển file đã xử lý sang `processed/` (batch SUCCESS) hoặc `failed/` (batch FAILED, sai đuôi file, hoặc slug concert không tồn tại) để demo được kết quả.
- [x] Cập nhật `blueprint/specs/csv-ingestion.md` (ADR + main flow + error scenarios + acceptance criteria) và `blueprint/design.md` ADR 4 (BP08).
- [x] 15 unit tests cho scheduled ingestion: 10 poller cases, 3 shared-ingest cases (composite dedup + duplicate + enqueue rollback), 2 processor cases (malformed header + terminal failure cleanup).

**Hoàn thành khi:** copy file vào inbox mà không gọi upload API vẫn tạo guest list; duplicate và malformed file được xử lý an toàn. Đã verify trực tiếp qua Docker (`docker compose logs -f backend`): `guests-valid.csv` → 5/5 row nhập, sweep `processed/`; copy trùng nội dung → sweep `processed/` không tạo batch mới, endpoint upload cùng nội dung trả `409`; `guests-with-errors.csv` → 3 row hợp lệ nhập, 3 row lỗi bị bỏ qua; slug không tồn tại và file `.txt` → sweep `failed/`; file thiếu header bắt buộc → retry đủ 3 lần, batch `FAILED`, sweep `failed/`, backend vẫn healthy. Enqueue failure có unit test xác nhận batch được chuyển sang `FAILED` và temp file được dọn, không còn batch `PROCESSING` bị treo.

Không cần distributed file watcher hoặc object storage.

## 4.5 Seed artist và seat map (`MUST`) — `DONE` (2026-07-14)

Rubric IM01/IM17 yêu cầu seed không chỉ có concert/ticket/giá mà còn có nghệ sĩ và sơ đồ chỗ ngồi, và sơ đồ đó phải tương tác được (chọn vé theo khu, phản ánh sold-out) chứ không chỉ là ảnh tĩnh.

- [x] Dùng `artists String[]` cho thông tin nghệ sĩ (migration `20260625000000_add_concert_artists`).
- [x] Thêm `artists` và `seatMapSvg` cho bốn concert seed (`data/seed/concerts.json`).
- [x] Cho `prisma/seed.ts` lưu hai trường trên.
- [x] SVG seed tương tác theo canonical zone `SVIP`/`VIP`/`CAT1`/`CAT2`/`GA` qua thuộc tính `data-zone` khớp đúng tên `ticketType.name`.
- [x] Click zone chọn/tăng số lượng đúng ticket type tương ứng (`ConcertDetail.tsx`, wiring qua `ref` + `useEffect` vì nội dung SVG được bơm bằng `dangerouslySetInnerHTML`).
- [x] Zone sold-out/locked (đã chọn loại vé khác, hoặc chưa mở bán) chuyển `grayscale + opacity`, cursor `not-allowed`; zone đang chọn có stroke đậm.
- [x] Sanitize `seatMapSvg` bằng `DOMPurify` (`USE_PROFILES: { svg: true, svgFilters: true }`) trước khi `dangerouslySetInnerHTML`, chặn `<script>`/`on*` handler — quan trọng vì `seatMapSvg` cũng nhận giá trị tự do qua admin API (`create`/`update` concert), không chỉ từ seed.
- [x] Auto-layout cũ giữ làm fallback khi concert không có `seatMapSvg`.
- [x] Chạy fresh seed (`docker compose down -v && up -d --build`) và kiểm tra UI: đủ 4 concert, đúng nghệ sĩ, đúng zone/giá/availability, sơ đồ tương tác qua headless-browser click.

**Hoàn thành khi:** `docker compose down -v` rồi khởi động lại vẫn có đủ 4 concert, artist data, ticket types/price và SVG seat map tương tác từ seed. Đã xác nhận bằng migration log, API response (`artists`, `seatMapSvg` có `data-zone`) và click trực tiếp vào từng zone trên trình duyệt (không qua nút +/-) cập nhật đúng giỏ hàng.

## 4.6 AI Artist Bio (`MUST`)

1. Giữ fallback để app không crash khi thiếu key.
2. Trước khi quay video, cấu hình một provider thật bằng env local.
3. Upload `data/sample-pdf/sample-pdf.pdf`.
4. Xác nhận log gọi provider và bio mới hiển thị trên concert detail.
5. Không commit hoặc quay lộ API key.

**Hoàn thành khi:** có một lần chạy provider thật; không cần benchmark nhiều model hoặc đánh giá chất lượng AI chuyên sâu.

## 4.7 Blueprint rubric gaps (`MUST`)

1. **BP04:** sửa high-level diagram để có web/PWA/API/DB/Redis/worker cùng payment, AI/PDF, scheduled CSV inbox và offline sync.
2. **BP06:** thêm sequence mua vé end-to-end đến QR, in-app và email; thể hiện fail/timeout/expiry/retry.
3. ~~**BP08:** thay ADR upload-only bằng scheduled inbox flow khớp implementation IM10~~ — done 2026-07-14 (§4.4, `blueprint/specs/csv-ingestion.md`).
4. **BP10:** ghi rõ 80.000/5 phút, 70% phút đầu (~933 req/s), token bucket key strategy, bot-fairness và hành vi `429`.
5. **BP11:** ghi rõ graceful degradation: browsing độc lập, payment `503` khi breaker open, order retry được và hard failure hoàn kho đúng một lần.
6. Render toàn bộ Mermaid/C4 và kiểm tra link/spec không lỗi.

**Hoàn thành khi:** ma trận BP01–BP15 không còn mục bắt buộc ở trạng thái `MISSING`/`PARTIAL` do thiếu tài liệu.

## 4.8 Bảy vấn đề kỹ thuật (`MUST`)

Mỗi vấn đề chỉ cần một demo rõ ràng ở quy mô phù hợp với máy học tập:

| # | Yêu cầu | Cách chứng minh tối thiểu |
|---|---|---|
| 1 | Race condition/oversell | Nhiều request tranh stock nhỏ; success không vượt stock, remaining không âm. |
| 2 | High traffic protection | Giải thích tải đỉnh ~933 req/s; burst demo tạo một số `429`, request hợp lệ vẫn qua. Không cần 80.000 user thật. |
| 3 | Payment instability | Mock gateway failure/timeout làm breaker mở; concert browsing vẫn hoạt động; retry không double charge. |
| 4 | Offline check-in | Scan offline, reconnect sync; hai scan cùng ticket chỉ một accepted. |
| 5 | Scheduled CSV ingestion | Drop valid/duplicate/malformed CSV vào inbox và quan sát xử lý. |
| 6 | Per-user limit under concurrency | Nhiều request cùng account không vượt `maxPerUser`. |
| 7 | Read-heavy/cache | Chứng minh cache HIT/MISS hoặc Redis key; dữ liệu được refresh/invalidate sau thay đổi. |

Output terminal, một DB/API assertion và đoạn demo video là đủ. Không bắt buộc chạy cloud-scale hoặc thu thập performance report chuyên nghiệp.

## 4.9 README và Blueprint (`MUST`)

Đối chiếu tài liệu với runtime cuối:

- kiến trúc tổng thể, C4 Level 1/2 và high-level diagram;
- database design;
- ít nhất hai business flows;
- RBAC;
- rate limiting, circuit breaker, idempotency và caching;
- offline check-in và scheduled CSV flow;
- README có một đường chạy Docker, tài khoản seed và cách demo chức năng chính;
- README dùng đúng đường dẫn `data/sample-csv/` và đúng tên ba file mẫu;
- README nói rõ Scanner PWA là mobile scanner implementation của rubric;
- proposal nói rõ mock gateway là demo path, VNPay optional và MoMo ngoài scope của bản cài đặt.

Không cần sửa lại mọi tài liệu tuần cũ nếu chúng được ghi rõ là historical và không dùng làm hướng dẫn hiện tại.

## 4.10 Hồ sơ nộp bài (`MUST`)

Theo `requirements.md` §7:

1. Google Drive public chứa:
   - `blueprint/` Markdown hoặc một `blueprint.pdf`;
   - source code, `data/`, seed script và README;
   - `clips/` chứa video MP4.
2. Video:
   - quay màn hình và demo trực tiếp, không bắt buộc slide;
   - bật camera thành viên trình bày;
   - FullHD 1080p, bitrate khoảng 720 kbps, MP4;
   - trình bày các vấn đề kỹ thuật đã giải quyết.
3. Tạo file `mã-nhóm_mssv1_mssv2_....txt` chỉ chứa public Drive link.
4. Mở link trong cửa sổ ẩn danh để kiểm tra quyền.

## 5. Thứ tự thực hiện đề xuất

1. ~~Scheduled CSV inbox (`BP08`, `IM10`)~~ — done 2026-07-14 (§4.4).
2. ~~Seed artist + `seatMapSvg` (`IM01`, `IM17`)~~ — done 2026-07-14 (§4.5).
3. Hoàn thiện high-level/purchase/traffic/graceful-degradation Blueprint (`BP04`, `BP06`, `BP10`, `BP11`).
4. Manual scanner acceptance (`IM07`, `IM08`).
5. Real AI provider run (`IM09`).
6. Chạy reminder và organizer/RBAC journeys (`IM04`, `IM05`, `IM06`).
7. Chạy bảy technical demos và sửa blocker, gồm VNPay currency unit test.
8. Sửa README và đối chiếu toàn bộ ma trận BP/IM.
9. Chạy full journey một lần từ volume sạch (`IM16`, `IM18`).
10. Quay video và đóng gói bài nộp.

## 6. Kiểm chứng cuối vừa đủ

Trước khi quay video:

```powershell
docker compose down -v
docker compose up -d --build
docker compose ps
```

Sau đó chạy:

- backend build và unit tests liên quan;
- web/scanner/mock-gateway build;
- một full audience buy-to-QR-email journey;
- một organizer CRUD/stats/CSV/AI journey;
- một scanner offline-sync journey;
- xác nhận seed có artist data và `seatMapSvg`;
- bảy technical demos ở §4.8;
- rà ma trận BP01–BP15 và IM01–IM18, không bỏ sót mục bắt buộc.

Lint chỉ là blocker khi gây build failure, che lỗi thật trong phần code mới hoặc được rubric yêu cầu riêng. Không trì hoãn đồ án chỉ để xóa toàn bộ lint debt cũ.

## 7. Ngoài critical path

Các mục sau có thể làm nếu còn thời gian nhưng không phải điều kiện hoàn thành theo `requirements.md` và rubric mới:

- production TLS/domain/deployment;
- Prometheus/Grafana và centralized logging;
- backup/restore automation;
- multi-instance/load balancer/waiting room;
- transactional outbox;
- full 80.000-user cloud load test; capacity reasoning, rate-limit code và demo `429` vẫn là bắt buộc;
- VNPay production certification và MoMo integration;
- native mobile app thay cho Scanner PWA; PWA phải được demo như mobile scanner implementation;
- per-seat assignment;
- hoàn thiện zero-warning/zero-lint cho toàn repository;
- email delivery dashboard hoặc production-grade audit trail.
