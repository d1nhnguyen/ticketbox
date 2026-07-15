# Đặc tả API quản trị concert và loại vé

## Mô tả

Các endpoint quản trị cho phép `ORGANIZER` quản lý vòng đời concert, loại vé, tiểu sử nghệ sĩ, danh sách khách mời và thống kê doanh thu. Toàn bộ `/admin/*` yêu cầu JWT hợp lệ cùng vai trò `ORGANIZER`.

## Luồng chính

### 1. Tạo và cấu hình concert

1. `POST /admin/concerts` tạo concert, mặc định `DRAFT`. Dữ liệu hỗ trợ `title`, `slug`, `venue`, `startsAt`, `artistBio`, `artists[]`, `bioSourceUrl`, `seatMapSvg`, `imageUrl` và `status`. Ảnh bìa có thể upload qua `POST /admin/upload/image` (multipart field `file`), trả về `{ imageUrl }` để gắn vào concert.
2. `POST /admin/ticket-types` tạo loại vé; `remainingQty` được khởi tạo bằng `totalQty`.
3. `PATCH /admin/concerts/:id` cập nhật concert; `PATCH /admin/ticket-types/:id` cập nhật loại vé.
4. Đổi concert sang `ON_SALE`; từng loại vé chỉ bán sau `saleStartsAt`.
5. Tạo/cập nhật/xóa/hủy concert chủ động vô hiệu hóa cache. Service loại vé hiện chưa gọi `CacheService`, nên thay đổi loại vé có thể chỉ xuất hiện trên public detail sau TTL tối đa 60 giây; đây là khoảng trống cần khắc phục nếu yêu cầu cập nhật tức thời.

### 2. Theo dõi doanh thu

- `GET /admin/concerts/:id/stats` tính trực tiếp từ PostgreSQL cho một concert: tổng doanh thu và số đơn `PAID`, cùng `soldQty`, `remainingQty`, doanh thu theo từng loại vé.
- `GET /admin/stats/overview?days=30` phục vụ dashboard tổng quan toàn hệ thống, trả về:
  - `totals`: tổng doanh thu, tổng vé bán, tổng đơn `PAID`, tổng concert và số vé đã check-in (`USED`).
  - `salesByDay`: chuỗi thời gian số vé/doanh thu theo ngày (mặc định 30 ngày, giới hạn 1–90; ngày quy đổi theo giờ Việt Nam, ngày không có giao dịch được điền `0`).
  - `ticketTypeBreakdown`: số vé bán và doanh thu theo từng loại vé (kèm tên concert) cho biểu đồ cơ cấu.
  - `concerts`: từng concert với sức chứa, vé đã bán và doanh thu.

Cả hai endpoint chỉ tính đơn `PAID` (không dùng `totalQty - remainingQty` vì `remainingQty` giảm ngay khi giữ chỗ), không cache và đọc trực tiếp DB. Chuỗi theo ngày dựa trên `Order.createdAt` của đơn `PAID` vì schema chưa có cột `paidAt` riêng.

### 3. Hủy concert

1. `POST /admin/concerts/:id/cancel` chạy transaction: đổi concert sang `CANCELLED`, hoàn kho và đổi đơn `PENDING → FAILED`, đổi vé `VALID → CANCELLED`.
2. Sau commit, service lấy danh sách người mua `PAID`, phát `concert.cancelled`, rồi vô hiệu hóa cache.
3. Notifications enqueue email và thông báo trong ứng dụng cho từng người mua.

### 4. Xóa concert

`DELETE /admin/concerts/:id` chỉ cho concert `DRAFT` chưa có đơn. Quan hệ cascade xóa `TicketType`, `GuestListEntry` và `CsvImportBatch` liên quan.

## Kịch bản lỗi

| Kịch bản | Kết quả |
|---|---|
| Không đăng nhập | `401 Unauthorized` |
| Vai trò `AUDIENCE`/`SCANNER` | `403 Forbidden` |
| Slug trùng | `409 Conflict` |
| Concert/loại vé không tồn tại | `404 Not Found` |
| Xóa concert không phải `DRAFT` | `400 Bad Request` |
| Xóa concert đã có đơn | `409 Conflict` |
| Hủy concert đã `CANCELLED` | `200`, không làm lại và không phát event lần hai |
| Giảm `totalQty` làm `remainingQty` âm | `400 Bad Request` |
| Xóa loại vé đã có đơn/vé | `409 Conflict` |

## Ràng buộc và cơ chế kỹ thuật

- `JwtAuthGuard` chạy trước `RolesGuard`; controller khai báo `@Roles(Role.ORGANIZER)`.
- Hủy concert có tính idempotent ở tầng service.
- `totalQty` được cập nhật theo delta; chỉ chấp nhận khi `remainingQty + delta >= 0`.
- Sự kiện `concert.cancelled` phát sau transaction, nên logic thông báo không nằm inline trong transaction quản trị.
- Thống kê không dùng cache, vì vậy phản ánh dữ liệu DB tại thời điểm gọi.
- Public `GET /concerts` loại `DRAFT` nhưng vẫn trả concert `CANCELLED`; UI có thể hiển thị trạng thái hủy.

## Tiêu chí chấp nhận

- `AUDIENCE` gọi `POST /admin/concerts` → `403`.
- `ORGANIZER` tạo `DRAFT`; admin thấy concert nhưng public API không thấy.
- Tạo loại vé với `totalQty=200` → `remainingQty=200`.
- Không thể giảm tổng số lượng xuống thấp hơn số đã bán/giữ.
- Hủy concert hoàn đúng kho `PENDING`, hủy vé `VALID` và chỉ phát một event chứa đủ `buyerUserIds`.
- Stats sau đơn `PAID` phản ánh đúng tổng và số liệu từng loại vé.
- `AUDIENCE`/`SCANNER` gọi `GET /admin/stats/overview` → `403`; `ORGANIZER` nhận đủ `totals`, `salesByDay` (đủ số ngày, có điền `0`), `ticketTypeBreakdown` và `concerts`.
- Đơn `PENDING`/`FAILED`/`EXPIRED` không được tính vào doanh thu hoặc số vé bán ở cả hai endpoint stats.
