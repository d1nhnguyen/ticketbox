# TicketBox — Test Plan theo yêu cầu môn học

> **Cập nhật:** 2026-07-14  
> **Phạm vi:** chỉ kiểm tra các yêu cầu trong `requirements.md` và khả năng chạy/demo bài nộp.  
> **Mục tiêu:** một nhóm sinh viên có thể chạy plan từ đầu đến cuối mà không biến nó thành production certification.

## 1. Cách dùng tài liệu

| Trạng thái | Ý nghĩa |
|---|---|
| `SẴN SÀNG` | Có thể test trên code hiện tại. |
| `THỦ CÔNG` | Cần thao tác trình duyệt/camera/hai browser profile. |
| `TEST SAU` | Chức năng bắt buộc chưa hoàn thiện; quay lại sau khi implement. |
| `CẦN KEY` | Cần credential dịch vụ ngoài, không commit vào repo. |
| `NGOÀI PHẠM VI` | Đã scope rõ trong proposal, không thuộc demo mặc định. |

Không cần mọi test có bộ hồ sơ evidence riêng. Với mỗi nhóm chức năng, chỉ cần ghi `PASS/FAIL`, lưu output terminal quan trọng và screenshot/video đủ để chứng minh trong bài trình bày.

## 2. Phạm vi hiện tại

| Chức năng | Trạng thái |
|---|---|
| Docker, seed, auth, concert browsing | `SẴN SÀNG` |
| Mock payment → QR | `SẴN SÀNG` |
| VNPay | Optional, `CẦN KEY`; mặc định phải disabled an toàn |
| MoMo | `NGOÀI PHẠM VI` bản cài đặt hiện tại |
| In-app notification và reminder | `SẴN SÀNG` |
| Email kèm e-ticket | `TEST SAU` |
| Organizer CRUD/cancel | `SẴN SÀNG` |
| Revenue API | `SẴN SÀNG` |
| Revenue UI chính xác | `TEST SAU` |
| CSV upload thủ công | `SẴN SÀNG` |
| CSV nhập định kỳ từ inbox | `TEST SAU` |
| AI fallback/provider integration | `SẴN SÀNG`; demo provider thật `CẦN KEY` |
| Scanner online/offline | `SẴN SÀNG`, cần kiểm tra `THỦ CÔNG` |

## 3. Chuẩn bị môi trường

### 3.1 Công cụ

- Docker Desktop và Docker Compose.
- Trình duyệt Chrome/Edge có DevTools và camera.
- Node.js 20+, npm 9+.
- k6 cho ba bài test concurrency/rate-limit.
- Hai browser profile hoặc hai thiết bị cho scanner conflict.

### 3.2 URL và tài khoản

| Service | URL |
|---|---|
| Web | `http://localhost:5173` |
| Scanner | `http://localhost:5174` |
| Backend | `http://localhost:3000` |
| Mock gateway | `http://localhost:4000` |

| Role | Email | Password |
|---|---|---|
| Audience | `audience@ticketbox.dev` | `password123` |
| Organizer | `organizer@ticketbox.dev` | `password123` |
| Scanner | `scanner@ticketbox.dev` | `password123` |

### 3.3 Khởi động sạch

Lệnh đầu xóa database local. Bỏ `-v` nếu muốn giữ dữ liệu:

```powershell
docker compose down -v
docker compose up -d --build
docker compose ps
```

Kiểm tra nhanh:

```powershell
curl.exe http://localhost:3000/health
curl.exe http://localhost:4000/health
curl.exe http://localhost:3000/concerts
```

**Đạt khi:** sáu service chạy/healthy, API trả `200`, danh sách có bốn concert seed đúng đề bài.

## 4. Cách sử dụng app

### Audience

1. Mở web `:5173` và login Audience.
2. Chọn concert, xem sơ đồ zone và loại vé.
3. Chọn số lượng và thanh toán qua mock gateway.
4. Xác nhận thành công.
5. Xem QR tại trang success hoặc **Vé của tôi**.
6. Xem **Thông báo**.

### Organizer

1. Login Organizer và vào **Admin Dashboard**.
2. Tạo/sửa/hủy concert.
3. Cấu hình ticket type, giá, số lượng, max-per-user và giờ mở bán.
4. Xem thống kê, upload CSV và PDF artist bio.

### Scanner

1. Mở scanner `:5174` bằng browser profile riêng.
2. Login Scanner, chọn concert và tải snapshot.
3. Scan QR hoặc tìm VIP guest.
4. Chỉ chuyển Offline sau khi app shell và snapshot đã tải xong.
5. Khi Online lại, app tự đồng bộ queue.

## 5. Kiểm tra khởi chạy và build

### RUN-01 — Docker từ dữ liệu sạch (`SẴN SÀNG`)

Chạy §3.3 và mở cả web/scanner.

**Mong đợi:** không restart loop, blank page hoặc lỗi CORS; backend tự migrate/seed; refresh frontend route vẫn mở được.

### RUN-02 — Build các package (`SẴN SÀNG`)

```powershell
Set-Location src/backend; npm run build; npm test -- --runInBand
Set-Location ../web; npm run build
Set-Location ../scanner; npm run build
Set-Location ../mock-gateway; npm run build
Set-Location ../..
```

**Mong đợi:** các build pass; backend tests quan trọng pass. Lint debt cũ không phải blocker trừ khi ảnh hưởng code mới hoặc build/demo.

## 6. Auth và RBAC

### AUTH-01 — Register/login (`SẴN SÀNG`)

- Thử register email sai, password ngắn và body thiếu.
- Register một tài khoản hợp lệ.
- Login ba tài khoản seed.

**Mong đợi:** body sai bị từ chối; public registration luôn tạo `AUDIENCE`; login đúng trả session hợp lệ.

### AUTH-02 — Quyền theo role (`SẴN SÀNG`)

| Thao tác | Audience | Organizer | Scanner |
|---|---:|---:|---:|
| Xem concert | Cho phép | Cho phép | Cho phép |
| Mua vé | Cho phép | Từ chối | Từ chối |
| Admin CRUD/stats | Từ chối | Cho phép | Từ chối |
| Tải dữ liệu/scan | Từ chối | Từ chối | Cho phép |

**Mong đợi:** backend trả `401/403` hoặc access denied phù hợp; không chỉ ẩn nút trên UI.

## 7. Xem concert và mua vé

### BUY-01 — Concert list/detail/SVG (`SẴN SÀNG`, `THỦ CÔNG`)

1. Mở danh sách bốn concert.
2. Mở từng detail.
3. Chọn các zone `GA`, `SVIP`, `VIP`, `CAT1`, `CAT2`.

**Mong đợi:** hiển thị thông tin nghệ sĩ, địa điểm, thời gian, giá, max-per-user và số vé còn; SVG tương tác; zone chưa mở bán/hết vé không mua được.

### BUY-02 — Số vé cập nhật gần thời gian thực (`SẴN SÀNG`)

Mở cùng concert ở hai cửa sổ, tạo order ở cửa sổ A và quan sát B trong khoảng 5–10 giây.

**Mong đợi:** remaining quantity cập nhật, không âm và khớp API.

### BUY-03 — Mock payment thành công → QR (`SẴN SÀNG`, quan trọng)

1. Đặt mock gateway ở `success`:

   ```powershell
   curl.exe -X POST http://localhost:4000/admin/mode -H "Content-Type: application/json" -d '{"mode":"success"}'
   ```

2. Audience mua một hoặc nhiều vé.
3. Xác nhận thành công tại mock gateway.

**Mong đợi:** order `PAID`, đúng số QR được tạo, QR còn thấy sau reload/dashboard, stock giảm đúng, có in-app notification.

### BUY-04 — Hủy/thất bại (`SẴN SÀNG`)

Tạo order rồi hủy tại mock gateway.

**Mong đợi:** không phát QR; order fail hoặc vẫn retry được theo UI; stock reservation được trả đúng một lần khi fail.

### BUY-05 — Max-per-user (`SẴN SÀNG`)

Mua đến giới hạn của ticket type rồi thử mua thêm qua order khác.

**Mong đợi:** tổng vé của cùng account không vượt `maxPerUser`; không thể lách bằng nhiều order nhỏ.

### BUY-06 — Retry/idempotency (`SẴN SÀNG`)

Reload trang success hoặc gửi lại cùng action/idempotency key.

**Mong đợi:** không tạo charge/order/ticket trùng; số QR không tăng sau retry.

### BUY-07 — VNPay/MoMo scope

- Mặc định `GET /payment/methods` phải báo VNPay disabled.
- Nếu nhóm có credential sandbox, có thể test VNPay như phần cộng thêm.
- MoMo không thuộc bản demo hiện tại và phải được nêu rõ trong proposal/video.

Không cần chứng nhận production gateway cho đồ án nếu scope đã được trình bày rõ.

## 8. Thông báo

### NOTIF-01 — In-app purchase notification (`SẴN SÀNG`)

Kiểm tra cùng `BUY-03`.

**Mong đợi:** đúng user/concert/order; confirm lại không tạo notification trùng không kiểm soát.

### NOTIF-02 — Concert cancellation (`SẴN SÀNG`)

Organizer hủy concert đã có paid buyer; Audience mở notification.

**Mong đợi:** buyer nhận thông báo hủy.

### NOTIF-03 — Reminder 24 giờ (`SẴN SÀNG`)

Tạo/điều chỉnh concert bắt đầu khoảng 24 giờ tới và có paid order. Chờ cron hoặc bật development demo endpoint để trigger.

**Mong đợi:** buyer nhận một reminder; chạy lại không tạo duplicate.

### NOTIF-04 — Email kèm QR (`TEST SAU`, bắt buộc)

Mở lại test sau khi có Mailpit/Mailhog và email e-ticket.

**Mong đợi:** purchase tạo email local đúng user/concert và chứa QR dùng được. Chỉ cần log rõ khi gửi lỗi; không yêu cầu production delivery audit.

## 9. Organizer

### ADMIN-01 — Concert và ticket type CRUD (`SẴN SÀNG`)

Tạo một concert tên `QA <timestamp>`, thêm ticket types, sửa dữ liệu rồi xóa hoặc hủy.

**Mong đợi:** dữ liệu hợp lệ được lưu và hiển thị public; input sai bị từ chối; sale-start/max-per-user áp dụng khi Audience mua.

### ADMIN-02 — Cancel concert (`SẴN SÀNG`)

Hủy concert test có order.

**Mong đợi:** concert không còn bán; buyer được thông báo; gọi lại không tạo side effect trùng.

### ADMIN-03 — Revenue API (`SẴN SÀNG`)

Tạo một order `PENDING` và một order `PAID`, gọi `GET /admin/concerts/:id/stats`.

**Mong đợi:** chỉ PAID được tính vào sold/revenue; fail/expiry không được tính.

### ADMIN-04 — Revenue trên UI (`TEST SAU`, bắt buộc)

Sau khi UI dùng stats API, lặp `ADMIN-03` trên dashboard.

**Mong đợi:** PENDING giảm availability nhưng không tăng doanh thu; confirm tăng đúng một lần.

## 10. CSV Guest List

Sample:

- `data/sample-csv/guests-valid.csv`
- `data/sample-csv/guests-duplicates.csv`
- `data/sample-csv/guests-with-errors.csv`

### CSV-01 — Upload thủ công (`SẴN SÀNG`)

Organizer upload lần lượt ba file.

**Mong đợi:** valid rows được import; cùng nội dung bị checksum dedup; file có row lỗi vẫn nhập row hợp lệ; worker không crash.

### CSV-02 — Nhập định kỳ từ inbox (`TEST SAU`, bắt buộc)

Sau khi có scheduler:

1. Copy valid CSV vào mounted inbox.
2. Không gọi HTTP upload.
3. Chờ scheduler.
4. Lặp với duplicate và malformed file.

**Mong đợi:** valid file tạo guest; duplicate được skip; malformed không làm backend ngừng; file được đưa vào processed/failed để quan sát.

## 11. AI Artist Bio

### AI-01 — PDF validation và fallback (`SẴN SÀNG`)

Organizer upload `data/sample-pdf/sample-pdf.pdf`; thử thêm một file không phải PDF.

**Mong đợi:** RBAC/validation đúng; thiếu key không làm app crash và fallback được ghi rõ.

### AI-02 — Provider thật (`CẦN KEY`, bắt buộc demo một lần)

1. Cấu hình một trong `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` và `AI_PROVIDER`.
2. Restart backend.
3. Upload sample PDF.
4. Xem log và concert detail.

**Mong đợi:** log thể hiện provider thật được gọi; bio non-fallback được lưu/hiển thị; key không xuất hiện trong repo hoặc video.

## 12. Scanner offline-first

Trước phần này cần một paid ticket từ `BUY-03` và guest từ `CSV-01`.

### SCAN-01 — Login và pre-download (`SẴN SÀNG`, `THỦ CÔNG`)

Login Scanner, thử login Audience/Organizer, chọn concert và tải snapshot.

**Mong đợi:** chỉ Scanner vào được; snapshot là real ticket/guest; concert/timestamp được lưu.

### SCAN-02 — Offline shell và queue (`THỦ CÔNG`)

1. Sau pre-download, DevTools → Offline.
2. Reload app.
3. Scan QR hợp lệ.
4. Scan lại cùng QR.
5. Reload lần nữa.

**Mong đợi:** app vẫn mở; lần đầu queued/accepted locally; lần hai bị chặn; pending record và device ID không mất qua reload.

### SCAN-03 — Reconnect sync (`THỦ CÔNG`)

Bật Online.

**Mong đợi:** queue tự sync, ticket thành `USED`, resend không tạo log mới.

### SCAN-04 — Hai thiết bị cùng vé (`THỦ CÔNG`, quan trọng)

Hai profile cùng pre-download, cùng offline scan một QR, sau đó reconnect lần lượt.

**Mong đợi:** chỉ một `ACCEPTED`, thiết bị còn lại nhận `DUPLICATE`; không có hai lượt vào cổng.

### SCAN-05 — VIP offline (`THỦ CÔNG`)

Offline tìm guest, check in, reload rồi reconnect.

**Mong đợi:** guest queue không mất, sync thành công; check-in lặp được xử lý idempotent/already checked-in.

## 13. Bảy vấn đề kỹ thuật

Reset seed trước bài test dùng stock:

```powershell
docker compose run --rm -e FORCE_SEED=1 --entrypoint sh backend -c "npx prisma migrate deploy && npx ts-node --transpile-only prisma/seed.ts"
```

Một lần chạy rõ ràng là đủ cho đồ án; có thể chạy lại nếu kết quả bất thường.

### TECH-01 — Không oversell (`SẴN SÀNG`)

```powershell
k6 run scripts/load-test/oversell.js
```

**Đạt khi:** số success không vượt stock, remaining không âm.

### TECH-02 — Rate limiting (`SẴN SÀNG`)

```powershell
k6 run scripts/load-test/rate-limit.js
```

**Đạt khi:** burst tạo một số `429` nhưng vẫn có request hợp lệ `200`; backend không crash. Không cần chạy 80.000 user thật.

### TECH-03 — Payment instability/circuit breaker (`SẴN SÀNG`)

Script cần backend development với `ENABLE_DEMO_ENDPOINTS=true`:

```powershell
node scripts/load-test/circuit-breaker.js
```

Trong lúc breaker mở, mở concert list/detail.

**Đạt khi:** breaker chuyển CLOSED/OPEN/HALF_OPEN/recover; payment lỗi có kiểm soát; browsing vẫn dùng được; retry không double charge.

### TECH-04 — Offline double scan (`THỦ CÔNG`)

Dùng `SCAN-02..04`; có thể bổ sung:

```powershell
node scripts/load-test/checkin-double-scan.js
```

**Đạt khi:** một accepted, duplicate bị chặn, resend cùng client log không tạo bản ghi mới.

### TECH-05 — Scheduled CSV (`TEST SAU`)

Dùng `CSV-02`.

**Đạt khi:** valid/duplicate/malformed file theo lịch được xử lý mà app vẫn chạy.

### TECH-06 — Per-user limit dưới concurrency (`SẴN SÀNG`)

Reset seed rồi:

```powershell
k6 run scripts/load-test/per-user-limit.js
```

**Đạt khi:** cùng account không mua vượt max-per-user.

### TECH-07 — Cache read-heavy (`SẴN SÀNG`)

```powershell
$env:CONCERT_SLUG="anh-trai-say-hi"
node scripts/load-test/caching.js
Remove-Item Env:CONCERT_SLUG
```

**Đạt khi:** có bằng chứng Redis/cache HIT-MISS hoặc cache key; nhiều read trả dữ liệu nhất quán; sau update/purchase dữ liệu được invalidate hoặc refresh đúng TTL.

## 14. Blueprint và README

Không cần review như tài liệu production. Chỉ kiểm tra các nội dung đề yêu cầu:

- [ ] Proposal: vấn đề, mục tiêu, users, scope, risks.
- [ ] Kiến trúc tổng thể và cách các thành phần giao tiếp.
- [ ] Mô tả ảnh hưởng khi payment/AI/email hoặc một thành phần ngoài gặp lỗi.
- [ ] C4 Level 1 và Level 2.
- [ ] High-level architecture diagram.
- [ ] Database design và các entity chính.
- [ ] Ít nhất hai business flow: purchase, offline check-in hoặc CSV ingestion.
- [ ] RBAC cho ba role.
- [ ] Thiết kế rate limiting, circuit breaker, idempotency và caching.
- [ ] Notification dùng channel abstraction để có thể thêm SMS/Zalo mà không sửa luồng nghiệp vụ chính.
- [ ] Specs có main flow, error flow, constraints và acceptance criteria.
- [ ] README có một lệnh chạy Docker, account seed và hướng dẫn demo.
- [ ] Không commit API key hoặc secret thật.

## 15. Regression cuối trước khi quay video

Từ dữ liệu sạch:

1. Docker up và health.
2. Ba role login và RBAC.
3. Audience browse → mock purchase → QR → app/email notification.
4. Organizer CRUD → stats → cancel → scheduled CSV → real AI bio.
5. Scanner pre-download → offline scan → reconnect → conflict.
6. Chạy bảy technical tests §13.

Nếu một phần chưa implement, giữ `TEST SAU`; không đánh PASS chỉ vì unit test hoặc code tồn tại.

## 16. Checklist nộp bài

Theo `requirements.md` §7:

- [ ] Drive public chứa `blueprint/` hoặc `blueprint.pdf`.
- [ ] Drive chứa source, `data/`, seed script và README.
- [ ] `clips/` có video MP4 FullHD 1080p, bitrate khoảng 720 kbps.
- [ ] Video có camera người trình bày và demo trực tiếp code/app, không bắt buộc slide.
- [ ] Video trình bày bảy vấn đề kỹ thuật và các journey chính.
- [ ] File nộp có tên `mã-nhóm_mssv1_mssv2_....txt`.
- [ ] Nội dung file chỉ là public Google Drive link.
- [ ] Link đã được thử trong cửa sổ ẩn danh.

## 17. Ma trận requirement → test

| Yêu cầu | Test |
|---|---|
| Concert, nghệ sĩ, venue, SVG, remaining | `BUY-01`, `BUY-02` |
| Chọn vé, thanh toán, QR | `BUY-03`, `BUY-04`, `BUY-06` |
| Max-per-user | `BUY-05`, `TECH-06` |
| App/email notification và reminder | `NOTIF-01..04` |
| Organizer CRUD/cancel/revenue | `ADMIN-01..04` |
| RBAC ba role | `AUTH-02`, `SCAN-01` |
| Scanner offline và double-scan | `SCAN-01..05`, `TECH-04` |
| AI bio từ PDF | `AI-01`, `AI-02` |
| CSV định kỳ | `CSV-01`, `CSV-02`, `TECH-05` |
| Race condition | `TECH-01` |
| High traffic protection | `TECH-02` |
| Payment instability/no double charge | `TECH-03`, `BUY-06` |
| Per-user concurrency | `TECH-06` |
| Read-heavy caching | `TECH-07` |
| Blueprint | §14 |
| Chạy được, seed data | `RUN-01`, `RUN-02` |
| Hồ sơ nộp | §16 |

## 18. Những thứ không bắt buộc test

Trừ khi giảng viên yêu cầu thêm, không cần dùng thời gian cho:

- production TLS/domain/cloud deployment;
- backup/restore và monitoring dashboard;
- literal 80.000-user load test;
- zero lint/warning toàn repository;
- nhiều hệ điều hành/trình duyệt;
- VNPay production certification hoặc MoMo integration;
- email delivery audit chuyên nghiệp;
- penetration test hoặc accessibility audit toàn diện.

Các lỗi làm sai requirement, crash app, mất dữ liệu, vượt stock/limit hoặc cho quét vé hai lần vẫn phải sửa trước khi nộp.
