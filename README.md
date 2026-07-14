# TicketBox

TicketBox là hệ thống bán và soát vé concert gồm web cho khán giả/ban tổ chức, Scanner PWA offline-first, NestJS API, PostgreSQL, Redis/BullMQ, cổng thanh toán mock hoặc VNPay sandbox, Mailpit và chức năng AI Artist Bio.

README này là hướng dẫn tự đủ để người chấm clone, khởi chạy và demo toàn bộ hệ thống. Tài liệu kiến trúc nằm trong [`blueprint/`](blueprint/), kế hoạch kiểm thử chi tiết nằm tại [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md).

## 1. Yêu cầu môi trường

### Bắt buộc

- Docker Desktop 24+ (có Docker Compose v2).
- Git.
- Khoảng 4 GB dung lượng trống cho image và volume.

### Tùy chọn

- Node.js 20+ và npm 9+ để chạy test/build ngoài Docker.
- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) để chạy các bài kiểm tra concurrency và rate limiting.
- API key Anthropic, Gemini hoặc OpenAI nếu muốn demo AI bằng provider thật. Không có key, hệ thống vẫn chạy và dùng fallback an toàn.

## 2. Khởi chạy nhanh bằng Docker

Từ thư mục gốc của repository:

```powershell
git clone <repository-url>
cd ticketbox
docker compose up -d --build
docker compose ps
```

Lần chạy đầu, backend tự động:

1. chờ PostgreSQL, Redis, Mailpit và mock gateway sẵn sàng;
2. chạy Prisma migration;
3. seed idempotent 4 concert, ticket type, artist, SVG seat map và 3 tài khoản mẫu;
4. khởi động API và BullMQ worker.

Kiểm tra nhanh:

```powershell
Invoke-RestMethod http://localhost:3000/health
(Invoke-RestMethod http://localhost:3000/concerts).Count
docker compose ps
```

Kết quả mong đợi: health trả trạng thái hoạt động, concert count bằng `4`, và cả 7 service đều healthy/running.

Nếu cần xem log:

```powershell
docker compose logs -f backend
```

> Mock payment là luồng demo mặc định, không cần tài khoản hay secret bên ngoài.

## 3. URL và tài khoản seed

| Thành phần | Địa chỉ |
|---|---|
| Web khán giả và ban tổ chức | <http://localhost:5173> |
| Scanner PWA | <http://localhost:5174> |
| Backend API | <http://localhost:3000> |
| Mock payment gateway | <http://localhost:4000> |
| Mailpit xem email | <http://localhost:8025> |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |

| Vai trò | Email | Mật khẩu | Nơi sử dụng |
|---|---|---|---|
| Khán giả (`AUDIENCE`) | `audience@ticketbox.dev` | `password123` | Web |
| Ban tổ chức (`ORGANIZER`) | `organizer@ticketbox.dev` | `password123` | Web/Admin |
| Nhân viên soát vé (`SCANNER`) | `scanner@ticketbox.dev` | `password123` | Scanner PWA |

RBAC được kiểm tra tại API bằng JWT/guard, tại route admin của web và tại Scanner PWA. Đăng nhập sai vai trò phải bị từ chối, không chỉ ẩn nút trên giao diện.

## 4. Kiến trúc runtime và ảnh hưởng khi lỗi

| Thành phần | Vai trò | Giao tiếp chính | Khi thành phần lỗi |
|---|---|---|---|
| Web | xem concert, mua vé, quản trị | HTTPS/JSON tới backend | Scanner và API vẫn độc lập; không mất dữ liệu |
| Scanner PWA | tải dữ liệu, quét QR, lưu scan offline | HTTPS khi online, IndexedDB khi offline | tiếp tục check-in từ dữ liệu đã tải; đồng bộ lại khi có mạng |
| Backend NestJS | auth, concert, order, ticket, admin, CSV, AI | Prisma, Redis, SMTP, payment HTTP | trả lỗi có kiểm soát; transaction bảo vệ dữ liệu |
| PostgreSQL | nguồn dữ liệu chuẩn | Prisma/SQL transaction | thao tác ghi dừng; không xác nhận thanh toán/check-in giả |
| Redis + BullMQ | cache và hàng đợi notification/CSV | Redis protocol | dữ liệu gốc vẫn ở PostgreSQL; tác vụ nền có thể retry sau |
| Mock/VNPay sandbox | thanh toán | redirect và callback có chữ ký | circuit breaker mở, payment trả `503`; duyệt concert vẫn hoạt động |
| Mailpit | SMTP và giao diện email local | SMTP `1025`, UI `8025` | order/ticket vẫn được tạo; lỗi gửi được log và job retry |

Chi tiết C4 Level 1, C4 Level 2, data model, failure isolation và ADR: [`blueprint/design.md`](blueprint/design.md). Phạm vi và actor: [`blueprint/proposal.md`](blueprint/proposal.md).

## 5. Các luồng demo chính

### 5.1 Khán giả mua vé và nhận e-ticket

1. Mở <http://localhost:5173>, đăng nhập tài khoản Audience.
2. Mở một concert, bấm trực tiếp khu trên SVG hoặc dùng nút `+/-` để chọn loại/số lượng vé.
3. Chọn Mock Payment và xác nhận thanh toán thành công.
4. Sau redirect, mở **Vé của tôi** để xem đầy đủ e-ticket và QR riêng của từng vé.
5. Mở **Thông báo** để xem thông báo trong app.
6. Mở Mailpit tại <http://localhost:8025>. Email gửi tới `audience@ticketbox.dev` hiển thị người mua, concert, ticket type và QR của từng ticket.

Luồng backend giữ stock trong transaction có row lock, enforce `maxPerUser` trên tổng `PENDING + PAID`, dùng idempotency để không tạo/charge hai lần, hoàn kho order hết hạn và invalidate cache liên quan. Xem [`blueprint/specs/purchase.md`](blueprint/specs/purchase.md), [`blueprint/specs/payment.md`](blueprint/specs/payment.md) và [`blueprint/specs/notifications.md`](blueprint/specs/notifications.md).

### 5.2 Ban tổ chức

1. Đăng nhập tài khoản Organizer; hệ thống chuyển tới `/admin`.
2. Tạo/sửa/hủy concert và cấu hình ticket type.
3. Mở chi tiết concert để xem lượng bán và doanh thu từ order `PAID`.
4. Upload Guest List CSV hoặc upload PDF để tạo Artist Bio.

Dữ liệu mẫu:

- CSV: [`data/sample-csv/guests-valid.csv`](data/sample-csv/guests-valid.csv), [`guests-duplicates.csv`](data/sample-csv/guests-duplicates.csv), [`guests-with-errors.csv`](data/sample-csv/guests-with-errors.csv).
- PDF: [`data/sample-pdf/sample-pdf.pdf`](data/sample-pdf/sample-pdf.pdf).

### 5.3 Scanner PWA và offline check-in

Scanner PWA tại <http://localhost:5174> là phần cài đặt mobile scanner của rubric; có thể cài như PWA hoặc demo bằng mobile viewport.

1. Đăng nhập bằng tài khoản Scanner.
2. Chọn concert và tải ticket/guest list trước khi mất mạng.
3. Trong DevTools chọn Network → Offline rồi reload trang.
4. Quét QR e-ticket. Scan được ghi vào IndexedDB và hiển thị pending.
5. Quét lại cùng QR trên thiết bị đó; local duplicate guard phải chặn.
6. Bật mạng lại; queue tự đồng bộ với backend và không mất scan sau reload.
7. Để demo xung đột, dùng hai browser profile quét cùng một vé khi offline. Khi đồng bộ, server chỉ chấp nhận một scan; scan còn lại nhận kết quả duplicate.

Giới hạn có chủ đích: hai thiết bị cùng offline không thể biết trạng thái của nhau theo thời gian thực. Unique constraint và transaction phía server giải quyết xung đột khi sync. Xem [`blueprint/specs/checkin.md`](blueprint/specs/checkin.md).

### 5.4 Scheduled Guest List CSV

Ngoài upload thủ công, backend poll thư mục inbox mỗi 10 giây. Tên file phải theo mẫu:

```text
<concert-slug>__<mô-tả-bất-kỳ>.csv
```

Ví dụ PowerShell từ thư mục gốc:

```powershell
Copy-Item data/sample-csv/guests-valid.csv data/inbox/anh-trai-say-hi__demo.csv
Start-Sleep -Seconds 15
Get-ChildItem data/inbox/processed
Get-ChildItem data/inbox/failed
```

File thành công hoặc checksum đã xử lý được chuyển vào `data/inbox/processed/`; sai slug, sai extension hoặc batch thất bại được chuyển vào `data/inbox/failed/`. Row lỗi được cô lập, checksum chống nhập trùng và lỗi file không làm dừng backend. Xem [`blueprint/specs/csv-ingestion.md`](blueprint/specs/csv-ingestion.md).

### 5.5 Nhắc trước concert 24 giờ

Reminder cron tạo notification và gửi email cho người có vé `PAID` khi concert đi vào cửa sổ khoảng 24 giờ. Để demo nhanh bằng debug trigger, bật endpoint demo theo mục 7, điều chỉnh concert vào cửa sổ reminder rồi gọi:

```powershell
Invoke-RestMethod -Method Post http://localhost:3000/debug/reminders/trigger
```

Kiểm tra thông báo trong web, email trong Mailpit và log backend. Channel notification tách riêng để có thể bổ sung SMS/Zalo mà không đổi purchase flow.

## 6. Cấu hình tùy chọn

Docker Compose tự đọc file `.env` ở thư mục gốc. File này đã được gitignore; không commit secret thật.

### 6.1 VNPay sandbox

Mock payment luôn sẵn sàng. Để hiện thêm lựa chọn VNPay sandbox, thêm đủ các biến sau vào `.env`:

```env
VNPAY_ENABLED=true
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_TMN_CODE=<sandbox-merchant-code>
VNPAY_HASH_SECRET=<sandbox-hash-secret>
VNPAY_RETURN_URL=http://localhost:5173/vnpay-return
```

Áp dụng cấu hình:

```powershell
docker compose up -d --force-recreate backend
```

Backend sinh request bằng giờ Việt Nam, kiểm tra chữ ký, amount, order reference, response code và currency khi callback có gửi trường currency. Đây chỉ là sandbox phục vụ đồ án; không phải tích hợp production. Không đưa `VNPAY_HASH_SECRET` vào source, ảnh chụp hoặc video.

### 6.2 AI Artist Bio bằng provider thật

Chọn một provider trong `.env`:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=<api-key>
```

Hoặc dùng `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`, hay `AI_PROVIDER=openai` + `OPENAI_API_KEY`. Sau đó:

```powershell
docker compose up -d --force-recreate backend
```

Đăng nhập Organizer, upload [`data/sample-pdf/sample-pdf.pdf`](data/sample-pdf/sample-pdf.pdf), kiểm tra text được tách/làm sạch và bio được lưu. Khi provider timeout/lỗi/không có key, backend dùng fallback có kiểm soát và không làm hỏng concert. Xem [`blueprint/specs/ai-bio.md`](blueprint/specs/ai-bio.md).

### 6.3 CORS

Mặc định backend chấp nhận `http://localhost:5173` và `http://localhost:5174`. Nếu đổi origin frontend, cập nhật `CORS_ALLOWED_ORIGINS` trong [`docker-compose.yml`](docker-compose.yml).

## 7. Demo cơ chế kỹ thuật

Ba endpoint `/payment/charge`, `/payment/reset` và `/debug/reminders/trigger` chỉ phục vụ demo/test, mặc định bị tắt và luôn bị tắt khi `NODE_ENV=production`.

Để bật tạm thời, thêm vào `.env` gốc:

```env
NODE_ENV=development
ENABLE_DEMO_ENDPOINTS=true
```

Sau đó recreate backend:

```powershell
docker compose up -d --force-recreate backend
```

Khi demo xong, đổi lại `NODE_ENV=production`, `ENABLE_DEMO_ENDPOINTS=false` và recreate backend.

### 7.1 Chuẩn bị lại dữ liệu stock

Các test oversell/per-user tiêu thụ stock. Lệnh sau xóa order/ticket hiện tại và tạo lại dữ liệu demo:

```powershell
docker compose run --rm -e FORCE_SEED=1 --entrypoint sh backend -c "npx prisma migrate deploy && npx ts-node --transpile-only prisma/seed.ts"
```

> Cảnh báo: `FORCE_SEED=1` xóa dữ liệu giao dịch demo hiện có.

### 7.2 Concurrency, rate limit và circuit breaker

Từ thư mục gốc:

```powershell
k6 run scripts/load-test/oversell.js
k6 run scripts/load-test/per-user-limit.js
k6 run scripts/load-test/rate-limit.js
node scripts/load-test/circuit-breaker.js
```

- `oversell.js`: 100 buyer tranh 50 vé, stock không âm và số thành công không vượt stock.
- `per-user-limit.js`: một account gửi request đồng thời nhưng tổng vé không vượt `maxPerUser`.
- `rate-limit.js`: burst có `429`, traffic chậm hợp lệ vẫn đi qua.
- `circuit-breaker.js`: mô phỏng gateway lỗi và chứng minh `CLOSED → OPEN → HALF_OPEN → CLOSED`; concert browsing vẫn hoạt động.

Chi tiết threshold và kết quả mong đợi: [`scripts/load-test/README.md`](scripts/load-test/README.md).

### 7.3 Idempotency và cache

- Gửi lại cùng purchase/payment request với cùng `Idempotency-Key`: backend trả lại kết quả cũ, không tạo order hoặc charge thứ hai.
- Concert list/detail được cache Redis với TTL. Admin update/cancel concert hoặc thay đổi ticket data sẽ invalidate key liên quan; availability cuối cùng vẫn được bảo vệ bởi PostgreSQL transaction, không lấy cache làm nguồn đúng tuyệt đối.

Kịch bản và assertion cụ thể nằm trong [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md), mục `BUY-06`, `TECH-07`.

## 8. Test và build

### Backend

```powershell
Set-Location src/backend
npm ci
npm test -- --runInBand
npm run build
Set-Location ../..
```

### Web

```powershell
Set-Location src/web
npm ci
npm run build
Set-Location ../..
```

### Scanner

```powershell
Set-Location src/scanner
npm ci
npm run build
Set-Location ../..
```

Kiểm tra Compose không sai cú pháp:

```powershell
docker compose config --quiet
```

## 9. Quản lý dữ liệu và vòng đời Docker

```powershell
# Dừng stack, giữ database
docker compose down

# Rebuild backend sau khi đổi source
docker compose up -d --build backend

# Rebuild toàn bộ
docker compose up -d --build
```

Chỉ dùng lệnh sau khi muốn xóa toàn bộ database và kiểm tra fresh start:

```powershell
docker compose down -v
docker compose up -d --build
```

Seed nằm trong [`data/seed/`](data/seed/) và được mount read-only vào backend. Inbox CSV được bind mount từ [`data/inbox/`](data/inbox/).

## 10. Đối chiếu rubric Blueprint

| Mã | Bằng chứng trong repository |
|---|---|
| BP01 | Tổng thể, giao tiếp và failure isolation trong [`blueprint/design.md`](blueprint/design.md) |
| BP02 | C4 Level 1 – System Context trong `design.md` |
| BP03 | C4 Level 2 – Container trong `design.md` |
| BP04 | High-level/runtime architecture trong `design.md`, gồm payment, AI/PDF, CSV và offline scanner |
| BP05 | ERD, quyết định PostgreSQL/Redis và schema tại [`src/backend/prisma/schema.prisma`](src/backend/prisma/schema.prisma) |
| BP06 | Luồng purchase/payment/notification trong [`blueprint/specs/purchase.md`](blueprint/specs/purchase.md) |
| BP07 | Luồng offline check-in, conflict và sync trong [`blueprint/specs/checkin.md`](blueprint/specs/checkin.md) |
| BP08 | Luồng upload/scheduled CSV, row lỗi và dedup trong [`blueprint/specs/csv-ingestion.md`](blueprint/specs/csv-ingestion.md) |
| BP09 | RBAC trong [`blueprint/specs/auth.md`](blueprint/specs/auth.md) và `design.md` |
| BP10 | Rate limiting, tải đột biến và fairness trong `design.md`/purchase spec |
| BP11 | Circuit breaker và graceful degradation trong [`blueprint/specs/payment.md`](blueprint/specs/payment.md) |
| BP12 | Idempotency key trong payment/purchase specs |
| BP13 | Cache TTL và invalidation trong `design.md` |
| BP14 | ADR và đánh đổi trong `design.md` cùng các specs |
| BP15 | [`blueprint/proposal.md`](blueprint/proposal.md), [`blueprint/design.md`](blueprint/design.md), [`blueprint/specs/`](blueprint/specs/) |

## 11. Đối chiếu rubric cài đặt

| Mã | Cách kiểm tra nhanh |
|---|---|
| IM01 | Web list/detail hiển thị artist, venue, SVG zone và vé còn lại |
| IM02 | Audience mua vé, mock/VNPay sandbox callback và QR e-ticket |
| IM03 | `k6 run scripts/load-test/per-user-limit.js` |
| IM04 | Purchase notification/email trong Mailpit và reminder mục 5.5 |
| IM05 | Organizer CRUD/cancel, ticket type và paid revenue/sold stats |
| IM06 | Role matrix API, web admin và Scanner PWA |
| IM07 | Scanner PWA quét và xác nhận QR tại cổng |
| IM08 | Offline/reload/reconnect/two-profile demo mục 5.3 |
| IM09 | Upload PDF, extract/clean và gọi provider/fallback |
| IM10 | Upload CSV và scheduled inbox mục 5.4 |
| IM11 | `k6 run scripts/load-test/oversell.js` |
| IM12 | `k6 run scripts/load-test/rate-limit.js` |
| IM13 | `node scripts/load-test/circuit-breaker.js` |
| IM14 | Retry cùng `Idempotency-Key`, đối chiếu một order/charge |
| IM15 | Cache MISS/HIT/TTL/invalidation theo `TECH-07` trong test plan |
| IM16 | Quick start, tài khoản, URL, dữ liệu mẫu và troubleshooting trong README này |
| IM17 | 4 concert mẫu, ticket type, artist và SVG tại [`data/seed/`](data/seed/) |
| IM18 | Fresh start rồi chạy ba journey Audience, Organizer, Scanner |

## 12. Cấu trúc repository

```text
ticketbox/
├── blueprint/
│   ├── proposal.md
│   ├── design.md
│   └── specs/
├── data/
│   ├── seed/
│   ├── sample-csv/
│   ├── sample-pdf/
│   └── inbox/
├── docs/
│   ├── COMPLETION_PLAN.md
│   └── TEST_PLAN.md
├── scripts/load-test/
├── src/
│   ├── backend/
│   ├── mock-gateway/
│   ├── scanner/
│   └── web/
├── docker-compose.yml
└── README.md
```

## 13. Troubleshooting

| Hiện tượng | Cách xử lý |
|---|---|
| Backend/web chưa healthy | `docker compose ps`, sau đó `docker compose logs backend` hoặc service tương ứng |
| `GET /concerts` không có 4 concert | Fresh reset bằng `docker compose down -v`, rồi `docker compose up -d --build` |
| Web không gọi được API | Kiểm tra backend `:3000` và `CORS_ALLOWED_ORIGINS` |
| Không thấy email | Kiểm tra Mailpit `:8025`, `docker compose logs backend` và Redis/BullMQ |
| CSV chưa được xử lý | Đợi ít nhất 15 giây; kiểm tra đúng mẫu tên, `processed/`, `failed/` và log backend |
| VNPay báo giao dịch hết hạn | Đồng bộ giờ hệ điều hành, recreate backend và tạo order mới; không dùng lại URL thanh toán cũ |
| VNPay callback thất bại | Kiểm tra đúng cặp TMN code/hash secret sandbox và return URL; không tự sửa query đã ký |
| Scanner không quét camera | Cấp quyền camera; trên thiết bị khác cần HTTPS, hoặc demo ở `localhost`/mobile viewport |
| Port đã được dùng | Dừng dịch vụ đang chiếm `3000`, `4000`, `5173`, `5174`, `5432`, `6379` hoặc `8025` |

Trước khi quay video/nộp bài, chạy toàn bộ checklist trong [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) và xem các việc còn mở tại [`docs/COMPLETION_PLAN.md`](docs/COMPLETION_PLAN.md).
