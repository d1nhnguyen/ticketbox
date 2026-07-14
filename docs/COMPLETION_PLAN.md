# TicketBox — Completion Plan cho đồ án môn học

> **Cập nhật:** 2026-07-14
>
> **Nguồn phạm vi duy nhất:** `requirements.md`
>
> **Mục tiêu:** hoàn thành đúng chức năng, cơ chế kỹ thuật, tài liệu và hồ sơ nộp bài; không mở rộng thành kế hoạch production.

## 1. Nguyên tắc phạm vi

Một hạng mục chỉ nằm trong critical path khi thỏa một trong ba điều kiện:

1. được yêu cầu trực tiếp trong `requirements.md`;
2. cần để chạy và demo một yêu cầu trực tiếp;
3. cần cho đúng cấu trúc bài nộp.

Không yêu cầu production certification. Các nội dung như TLS, cloud deployment, backup, monitoring dashboard, multi-region, zero lint toàn repository hoặc full-scale 80.000 user không phải điều kiện hoàn thành đồ án.

### Mức ưu tiên

| Mức | Ý nghĩa |
|---|---|
| `MUST` | Yêu cầu trực tiếp của đề hoặc blocker của demo chính. |
| `SHOULD` | Cải thiện độ ổn định/trình bày nếu còn thời gian. |
| `OPTIONAL` | Không ảnh hưởng completion; chỉ làm sau khi `MUST` hoàn tất. |

## 2. Definition of Done tối giản

TicketBox được xem là hoàn thành khi:

- [ ] Một người mới có thể chạy hệ thống theo README và thấy dữ liệu seed.
- [ ] Ba vai trò đăng nhập và chỉ dùng đúng chức năng của mình.
- [ ] Audience xem concert, sơ đồ SVG, số vé; mua vé và nhận QR.
- [ ] Organizer quản lý concert/ticket type, hủy concert và xem doanh thu đã thanh toán.
- [ ] Purchase notification xuất hiện trong app và email có e-ticket.
- [ ] Reminder trước concert khoảng 24 giờ hoạt động.
- [ ] Scanner tải dữ liệu, scan offline và đồng bộ lại; một vé không được accepted hai lần.
- [ ] AI bio xử lý PDF và đã được demo ít nhất một lần với provider thật.
- [ ] CSV guest list được nhập định kỳ, xử lý file lỗi và dữ liệu trùng.
- [ ] Bảy vấn đề kỹ thuật trong đề có code thật và demo/bằng chứng quy mô phù hợp.
- [ ] Blueprint, source/data/README và video đáp ứng cấu trúc nộp bài.

## 3. Trạng thái hiện tại

### 3.1 Đã có trong code

- [x] Bốn concert seed đúng tên đề bài, ticket types và ba tài khoản role.
- [x] JWT authentication và RBAC `AUDIENCE`, `ORGANIZER`, `SCANNER`.
- [x] Concert list/detail, SVG zones và polling số vé còn lại.
- [x] Atomic inventory reservation, chống oversell và per-user limit.
- [x] Redis idempotency, token-bucket rate limiting và cache-aside.
- [x] Mock payment gateway, circuit breaker và QR ticket issuance.
- [x] VNPay optional có validation/signature/amount/currency checks; MoMo được scope out trong proposal.
- [x] In-app purchase/cancellation notification và reminder cron.
- [x] Organizer concert/ticket CRUD, cancellation và paid stats API.
- [x] CSV upload, checksum dedup, row-level validation và BullMQ worker.
- [x] PDF extraction, AI provider selection và fallback.
- [x] Scanner login, real pre-download, IndexedDB queues, offline sync và server double-scan guard.
- [x] Docker Compose cho Postgres, Redis, backend, mock gateway, web và scanner.
- [x] Blueprint proposal/design/specs và các sơ đồ chính.

### 3.2 Cần hoàn thành hoặc kiểm chứng thêm

| Hạng mục | Loại | Trạng thái |
|---|---|---|
| Manual browser scanner journey | `MUST` | Code có, chưa chạy đủ offline/reload/two-device. |
| Email xác nhận kèm e-ticket | `MUST` | Chưa có local mail demo và QR email hoàn chỉnh. |
| Organizer revenue UI | `MUST` | Backend stats đúng; UI vẫn suy từ inventory reservation. |
| Scheduled CSV ingestion | `MUST` | Hiện chỉ có upload thủ công. |
| Real AI demonstration | `MUST` | Code provider có; cần key và bằng chứng một lần chạy thật. |
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

Yêu cầu đề bài: mua thành công phải có thông báo app và email kèm e-ticket.

1. Thêm Mailpit hoặc Mailhog vào Compose để người chấm xem email local.
2. Cấu hình backend gửi email vào mail service đó.
3. Email hiển thị user, concert, ticket type và QR của từng ticket.
4. Giữ kiến trúc channel hiện tại để có thể thêm SMS/Zalo sau này.
5. Khi email lỗi, log rõ; retry đơn giản là đủ nếu đã có BullMQ.

**Hoàn thành khi:** một mock purchase tạo in-app notification và một email local có QR đọc được.

Không cần delivery dashboard, exactly-once email hoặc SMTP production audit.

## 4.3 Organizer revenue đúng (`MUST`)

1. Cho Dashboard/AdminConcertDetail dùng `GET /admin/concerts/:id/stats`.
2. Revenue và sold tickets chỉ tính order `PAID`.
3. Có thể hiển thị thêm remaining/pending nhưng không bắt buộc.
4. Thêm một test đơn giản với một PENDING và một PAID order.

**Hoàn thành khi:** PENDING làm giảm availability nhưng không tăng doanh thu; confirm tăng doanh thu đúng một lần; fail/expiry không được tính.

## 4.4 Scheduled CSV guest ingestion (`MUST`)

Đề yêu cầu “định kỳ nhập” CSV, nên upload-only chưa đủ.

1. Mount một inbox, ví dụ `/data/inbox`.
2. Cron/BullMQ poll định kỳ và đưa file mới vào pipeline CSV hiện có.
3. Dùng checksum hiện có để bỏ qua nội dung trùng.
4. File có row lỗi vẫn nhập row hợp lệ.
5. File malformed không làm worker/backend crash.
6. Di chuyển file đã xử lý sang `processed/` hoặc `failed/` để demo được kết quả.

**Hoàn thành khi:** copy file vào inbox mà không gọi upload API vẫn tạo guest list; duplicate và malformed file được xử lý an toàn.

Không cần distributed file watcher hoặc object storage.

## 4.5 AI Artist Bio (`MUST`)

1. Giữ fallback để app không crash khi thiếu key.
2. Trước khi quay video, cấu hình một provider thật bằng env local.
3. Upload `data/sample-pdf/sample-pdf.pdf`.
4. Xác nhận log gọi provider và bio mới hiển thị trên concert detail.
5. Không commit hoặc quay lộ API key.

**Hoàn thành khi:** có một lần chạy provider thật; không cần benchmark nhiều model hoặc đánh giá chất lượng AI chuyên sâu.

## 4.6 Bảy vấn đề kỹ thuật (`MUST`)

Mỗi vấn đề chỉ cần một demo rõ ràng ở quy mô phù hợp với máy học tập:

| # | Yêu cầu | Cách chứng minh tối thiểu |
|---|---|---|
| 1 | Race condition/oversell | Nhiều request tranh stock nhỏ; success không vượt stock, remaining không âm. |
| 2 | High traffic protection | Burst request tạo một số `429`, request hợp lệ vẫn qua. Không cần 80.000 user thật. |
| 3 | Payment instability | Mock gateway failure/timeout làm breaker mở; concert browsing vẫn hoạt động; retry không double charge. |
| 4 | Offline check-in | Scan offline, reconnect sync; hai scan cùng ticket chỉ một accepted. |
| 5 | Scheduled CSV ingestion | Drop valid/duplicate/malformed CSV vào inbox và quan sát xử lý. |
| 6 | Per-user limit under concurrency | Nhiều request cùng account không vượt `maxPerUser`. |
| 7 | Read-heavy/cache | Chứng minh cache HIT/MISS hoặc Redis key; dữ liệu được refresh/invalidate sau thay đổi. |

Output terminal, một DB/API assertion và đoạn demo video là đủ. Không bắt buộc chạy cloud-scale hoặc thu thập performance report chuyên nghiệp.

## 4.7 README và Blueprint (`MUST`)

Đối chiếu tài liệu với runtime cuối:

- kiến trúc tổng thể, C4 Level 1/2 và high-level diagram;
- database design;
- ít nhất hai business flows;
- RBAC;
- rate limiting, circuit breaker, idempotency và caching;
- offline check-in và scheduled CSV flow;
- README có một đường chạy Docker, tài khoản seed và cách demo chức năng chính;
- proposal nói rõ mock gateway là demo path, VNPay optional và MoMo ngoài scope của bản cài đặt.

Không cần sửa lại mọi tài liệu tuần cũ nếu chúng được ghi rõ là historical và không dùng làm hướng dẫn hiện tại.

## 4.8 Hồ sơ nộp bài (`MUST`)

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

1. Email + local mail viewer.
2. Revenue UI.
3. Scheduled CSV inbox.
4. Manual scanner acceptance.
5. Real AI run.
6. Chạy bảy technical demos và sửa blocker phát hiện được.
7. Đối chiếu README/blueprint.
8. Chạy full journey một lần từ dữ liệu sạch.
9. Quay video và đóng gói bài nộp.

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
- bảy technical demos ở §4.6.

Lint chỉ là blocker khi gây build failure, che lỗi thật trong phần code mới hoặc được rubric yêu cầu riêng. Không trì hoãn đồ án chỉ để xóa toàn bộ lint debt cũ.

## 7. Ngoài critical path

Các mục sau có thể làm nếu còn thời gian nhưng không phải điều kiện hoàn thành theo `requirements.md`:

- production TLS/domain/deployment;
- Prometheus/Grafana và centralized logging;
- backup/restore automation;
- multi-instance/load balancer/waiting room;
- transactional outbox;
- full 80.000-user cloud load test;
- VNPay production certification và MoMo integration;
- native mobile app thay cho scanner PWA;
- per-seat assignment;
- hoàn thiện zero-warning/zero-lint cho toàn repository;
- email delivery dashboard hoặc production-grade audit trail.
