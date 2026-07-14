# TicketBox — Completion Plan

> **Cập nhật:** 2026-07-14
> **Phạm vi:** chỉ liệt kê công việc còn lại để hoàn thiện project theo rubric `BP01–BP15`, `IM01–IM18`. Các hạng mục đã hoàn thành được loại khỏi tài liệu này.

## 1. Trạng thái còn mở

### Blueprint

| Mã | Trạng thái | Việc cần làm |
|---|---|---|
| BP04 | `PARTIAL` | Hoàn thiện high-level architecture diagram: web, Scanner PWA, API, PostgreSQL, Redis/BullMQ worker, payment, AI/PDF, scheduled CSV inbox, email và offline sync; ghi rõ giao tiếp chính. |
| BP06 | `PARTIAL` | Thêm sequence end-to-end từ click mua đến QR/in-app/email; thể hiện reservation, payment timeout/fail, order expiry, hoàn kho, idempotency và email retry. |
| BP10 | `PARTIAL` | Bổ sung capacity reasoning cho 80.000 người/5 phút, 70% ở phút đầu (~933 request/giây), rate-limit key strategy, bot fairness và hành vi `429`. |
| BP11 | `PARTIAL` | Mô tả graceful degradation khi payment lỗi: browsing vẫn hoạt động, payment trả `503`, order có thể retry, không double charge và hard failure hoàn kho đúng một lần. |

### Cài đặt và bằng chứng runtime

| Mã | Trạng thái | Việc cần làm |
|---|---|---|
| IM03 | `PARTIAL` | Chạy concurrency test cho cùng một account và lưu assertion tổng vé `PAID + PENDING` không vượt `maxPerUser`. |
| IM04 | `PARTIAL` | Chạy reminder khoảng 24 giờ trước concert và lưu bằng chứng notification được tạo/gửi. |
| IM05 | `PARTIAL` | Chạy organizer UI journey: tạo/sửa/hủy concert, quản lý ticket type và kiểm tra paid revenue/sold-ticket stats. |
| IM06 | `PARTIAL` | Chạy role matrix cho API, web và scanner với `AUDIENCE`, `ORGANIZER`, `SCANNER`; lưu các kết quả allow/deny. |
| IM07 | `PARTIAL` | Demo Scanner PWA trên mobile viewport/device: login, tải dữ liệu, quét QR và xác nhận tại cổng; ghi rõ PWA là mobile scanner implementation. |
| IM08 | `PARTIAL` | Chạy offline/reload/two-profile acceptance; pending scan không mất và cùng một vé chỉ có một kết quả `ACCEPTED` sau đồng bộ. |
| IM09 | `PARTIAL` | Chạy AI Artist Bio ít nhất một lần với provider thật: upload PDF, extract/clean text, sinh bio và lưu evidence không lộ API key. |
| IM11 | `PARTIAL` | Chạy oversell demo với stock nhỏ; chứng minh số request thành công không vượt stock và `remainingQty` không âm. |
| IM12 | `PARTIAL` | Chạy burst/load demo; chứng minh rate limiter trả một số `429` nhưng request hợp lệ vẫn qua. |
| IM13 | `PARTIAL` | Demo circuit breaker `OPEN → HALF_OPEN → CLOSED`, payment trả fallback phù hợp và concert browsing không bị ảnh hưởng. |
| IM14 | `PARTIAL` | Chạy duplicate/retry demo với cùng `Idempotency-Key`; chứng minh không tạo order hoặc charge thứ hai. |
| IM15 | `PARTIAL` | Chạy cache evidence: MISS, HIT, TTL và invalidation sau khi concert/ticket data thay đổi. |
| IM16 | `PARTIAL` | README đã được đối chiếu với Compose, seed, URL, CSV, Scanner PWA và cấu hình tùy chọn; còn chạy quick start từ volume sạch trên môi trường mới để chốt bằng chứng. |
| IM18 | `PARTIAL` | Chạy toàn bộ hệ thống theo Blueprint từ volume sạch, thực hiện các journey chính và lưu evidence/video. |

## 2. Thứ tự thực hiện

### Bước 1 — Hoàn thiện Blueprint

1. Cập nhật high-level architecture diagram (`BP04`).
2. Viết purchase sequence end-to-end (`BP06`).
3. Viết traffic/capacity/rate-limit reasoning (`BP10`).
4. Hoàn thiện payment graceful-degradation flow (`BP11`).
5. Render toàn bộ Mermaid/C4 và kiểm tra link, tên component, giao tiếp và failure path.

**Đạt khi:** không còn Blueprint bắt buộc ở trạng thái `PARTIAL` do thiếu nội dung.

### Bước 2 — Scanner offline acceptance

1. Login bằng Scanner; xác nhận Audience và Organizer bị từ chối.
2. Chọn concert và tải tickets/guest list thật.
3. Chuyển trình duyệt sang Offline rồi reload PWA.
4. Scan QR hợp lệ; scan lại trên cùng thiết bị phải bị chặn.
5. Reload và xác nhận pending scan không mất.
6. Online trở lại và xác nhận pending scan tự đồng bộ.
7. Dùng hai browser profile scan cùng QR khi offline; sau sync chỉ một `ACCEPTED`, một `DUPLICATE`.
8. Chạy thêm VIP guest offline rồi sync.
9. Lưu screenshot/video ở mobile viewport.

**Hoàn tất:** `IM07`, `IM08`.

### Bước 3 — AI provider thật

1. Cấu hình API key bằng environment variable, không commit key.
2. Upload PDF nghệ sĩ từ Organizer UI.
3. Kiểm tra text extraction/cleaning và bio được provider thật sinh ra.
4. Kiểm tra fallback/error message khi provider không khả dụng.
5. Lưu screenshot/video và log đã che thông tin nhạy cảm.

**Hoàn tất:** `IM09`.

### Bước 4 — Reminder, Organizer và RBAC

1. Tạo/điều chỉnh concert nằm trong cửa sổ reminder khoảng 24 giờ.
2. Chạy reminder cron/debug trigger và kiểm tra notification.
3. Chạy organizer journey: concert CRUD, cancellation, ticket-type CRUD và paid stats.
4. Kiểm tra `PENDING` giảm availability nhưng không tăng revenue; `PAID` tăng revenue đúng một lần.
5. Chạy role matrix cho API, web và scanner.

**Hoàn tất:** `IM04`, `IM05`, `IM06`.

### Bước 5 — Technical-mechanism evidence

Mỗi demo cần lưu output terminal, HTTP/DB assertion hoặc đoạn video ngắn:

1. Per-user limit dưới concurrent requests (`IM03`).
2. Tranh vé cuối và không oversell (`IM11`).
3. Burst traffic và phản hồi `429` (`IM12`).
4. Payment timeout/failure và circuit-breaker state (`IM13`).
5. Retry cùng idempotency key không tạo giao dịch thứ hai (`IM14`).
6. Cache MISS/HIT/TTL/invalidation (`IM15`).
7. Offline check-in conflict đã thực hiện ở Bước 2 (`IM08`).

**Đạt khi:** mỗi cơ chế có ít nhất một evidence có thể trình bày trong video, không cần chạy tải cloud-scale thật.

### Bước 6 — README và fresh-start verification

README hiện đã có quick start, 7 service/port, tài khoản seed, đúng đường dẫn dữ liệu mẫu, Scanner PWA, email e-ticket, CSV inbox, AI/VNPay tùy chọn, test kỹ thuật và bảng đối chiếu `BP01–BP15`/`IM01–IM18`.

1. Từ volume sạch trên môi trường kiểm thử mới, chạy:

```powershell
docker compose down -v
docker compose up -d --build
docker compose ps
```

2. Xác nhận cả 7 service healthy và seed có đủ 4 concert.
3. Chạy lại các journey:
   - audience mua vé → QR → in-app notification → email;
   - organizer CRUD/stats/CSV/AI;
   - scanner offline → reconnect → sync.

**Hoàn tất:** `IM16`, `IM18`.

### Bước 7 — Hồ sơ nộp bài

1. Quay video demo trực tiếp các journey chính và technical mechanisms.
2. Video MP4 FullHD 1080p, có camera người trình bày; bitrate khoảng 720 kbps.
3. Google Drive public chứa:
   - `blueprint/` hoặc `blueprint.pdf`;
   - source code, `data/`, seed script và README;
   - `clips/` chứa video MP4.
4. Tạo file `mã-nhóm_mssv1_mssv2_....txt` chỉ chứa public Drive link.
5. Mở link trong cửa sổ ẩn danh để kiểm tra quyền truy cập.

## 3. Definition of Done còn lại

- [ ] Blueprint `BP04`, `BP06`, `BP10`, `BP11` đạt `DONE`.
- [ ] Một người mới chạy được project từ README và thấy dữ liệu seed.
- [ ] Role matrix của ba vai trò đạt trên API, web và scanner.
- [ ] Reminder khoảng 24 giờ đã được chạy và có evidence.
- [ ] Organizer journey CRUD/cancel/ticket types/paid stats đạt.
- [ ] Scanner offline/reload/reconnect/two-profile journey đạt.
- [ ] AI Artist Bio đã chạy ít nhất một lần với provider thật.
- [ ] Per-user limit, oversell, rate limiting, circuit breaker, idempotency và cache có runtime evidence.
- [ ] Full Compose khởi chạy từ volume sạch và cả 7 service healthy.
- [ ] Audience, Organizer và Scanner full journeys đạt trên fresh environment.
- [ ] README, Blueprint và runtime không còn thông tin mâu thuẫn.
- [ ] Video, Drive và submission `.txt` đáp ứng đúng cấu trúc nộp bài.

## 4. Ngoài critical path

Không trì hoãn bài nộp để làm các nội dung sau:

- production TLS/domain/cloud deployment;
- Prometheus/Grafana, centralized logging và backup automation;
- multi-instance/load balancer/waiting room;
- transactional outbox;
- full 80.000-user cloud load test;
- VNPay production certification hoặc MoMo integration;
- native mobile app thay cho Scanner PWA;
- per-seat assignment;
- dọn toàn bộ lint debt không ảnh hưởng build/test/demo;
- production email delivery dashboard.
