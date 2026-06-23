# Đặc tả: Quản trị Concert & Loại Vé (Admin API Spec)

## Mô tả

Tính năng này cung cấp giao diện quản lý nội bộ dành cho **Ban Tổ Chức (ORGANIZER)**, cho phép tạo và quản lý vòng đời của concert (từ bản nháp đến khi hủy), cấu hình các loại vé, và xem thống kê doanh thu. Toàn bộ các endpoint yêu cầu JWT hợp lệ với role `ORGANIZER`.

---

## Luồng chính

### 1. Tạo và cấu hình concert mới

1. BTC gửi `POST /admin/concerts` với thông tin concert (tiêu đề, slug, địa điểm, ngày diễn). Concert được tạo ở trạng thái `DRAFT` mặc định.
2. BTC tạo các loại vé qua `POST /admin/ticket-types` (tên, giá, số lượng, `maxPerUser`, thời điểm mở bán). `remainingQty` được khởi tạo bằng `totalQty`.
3. BTC cập nhật thông tin (sơ đồ chỗ ngồi SVG, bio nghệ sĩ, v.v.) qua `PATCH /admin/concerts/:id`.
4. Khi chuẩn bị mở bán, BTC đổi `status = ON_SALE` qua `PATCH /admin/concerts/:id`.
5. Vé bắt đầu bán theo `saleStartsAt` đã cấu hình ở từng loại vé.

### 2. Theo dõi doanh thu

1. BTC gọi `GET /admin/concerts/:id/stats`.
2. Hệ thống trả về: tổng doanh thu (chỉ tính đơn hàng `PAID`), tổng số đơn, và per-ticket-type: số vé đã bán (`soldQty`), số còn lại (`remainingQty`), doanh thu từng loại.

### 3. Hủy concert

1. BTC gọi `POST /admin/concerts/:id/cancel`.
2. Hệ thống thực hiện trong **một transaction duy nhất**:
   a. Đổi trạng thái concert → `CANCELLED`.
   b. Hủy toàn bộ đơn hàng `PENDING` → `FAILED` và **hoàn lại `remainingQty`** vào kho cho từng loại vé.
   c. Hủy toàn bộ vé `VALID` → `CANCELLED`.
3. Sau khi transaction commit, phát sự kiện `concert.cancelled` kèm danh sách `buyerUserIds` (từ đơn hàng `PAID`) để module Notifications xử lý thông báo cho khán giả.

---

## Kịch bản lỗi

| Kịch bản | HTTP Code | Mô tả |
|---|---|---|
| Truy cập với role AUDIENCE hoặc SCANNER | `403 Forbidden` | RolesGuard từ chối |
| Truy cập khi chưa đăng nhập | `401 Unauthorized` | JwtAuthGuard từ chối |
| Tạo concert với slug đã tồn tại | `409 Conflict` | Prisma P2002 → slug unique |
| Cập nhật/hủy concert không tồn tại | `404 Not Found` | |
| Xóa concert không ở trạng thái DRAFT | `400 Bad Request` | Chỉ được xóa DRAFT |
| Xóa concert DRAFT đã có đơn hàng | `409 Conflict` | Dùng cancel thay thế |
| Hủy concert đã ở trạng thái CANCELLED | Idempotent `200` | Không thực hiện lại, không phát event lần 2 |
| Tạo loại vé với `concertId` không tồn tại | `404 Not Found` | |
| Giảm `totalQty` xuống dưới số đã bán/giữ | `400 Bad Request` | Bảo vệ tính toàn vẹn kho |
| Xóa loại vé đã có đơn hàng hoặc vé phát hành | `409 Conflict` | |

---

## Ràng buộc & Cơ chế Kỹ thuật

- **RBAC nghiêm ngặt:** Tất cả endpoint `/admin/*` đều yêu cầu `@Roles(Role.ORGANIZER)` + `RolesGuard` + `JwtAuthGuard`. AUDIENCE token → 403.
- **Cancel idempotent:** Nếu concert đã ở trạng thái `CANCELLED`, gọi lại `/cancel` không thực hiện thêm bất kỳ thay đổi nào và không phát sự kiện lần 2.
- **Hoàn kho an toàn khi hủy:** Việc tăng `remainingQty` cho các đơn `PENDING` khi cancel sử dụng cùng cơ chế `increment` như `failPayment` trong `orders.service.ts`, đảm bảo không có race condition khi nhiều thao tác đồng thời.
- **Bảo vệ delta `totalQty`:** Khi giảm `totalQty` của loại vé, hệ thống kiểm tra `remainingQty + delta >= 0` trước khi cập nhật để không làm kho âm.
- **Event-driven seam:** Sự kiện `concert.cancelled` được phát qua `EventEmitter2` (loose-coupled). Module Notifications (Person B) sẽ đăng ký `@OnEvent('concert.cancelled')` để gửi thông báo — không có logic gửi thông báo inline trong admin module.
- **Xóa concert an toàn:** Chỉ cho phép `DELETE` concert ở trạng thái `DRAFT` và chưa có đơn hàng nào. Cascade delete trên Prisma schema sẽ xóa các `TicketType` liên quan.

---

## Tiêu chí chấp nhận

1. Đăng nhập với AUDIENCE token → gọi `POST /admin/concerts` → nhận **403**.
2. Đăng nhập với ORGANIZER token → tạo concert `DRAFT` → `GET /admin/concerts` hiển thị concert DRAFT → public `GET /concerts` **không** hiển thị concert DRAFT.
3. Tạo loại vé → `totalQty=200`, `remainingQty` tự động = 200.
4. Cố giảm `totalQty` của loại vé đã bán 50 vé xuống còn 100 (delta = -100, nhưng remaining còn 150) → thành công; giảm xuống còn 40 → **400 Bad Request**.
5. Hủy concert → đơn `PENDING` chuyển `FAILED`, kho hoàn về đúng số; vé `VALID` chuyển `CANCELLED`; sự kiện `concert.cancelled` được phát đúng 1 lần với `buyerUserIds` chứa đủ danh sách.
6. Gọi cancel lần 2 trên concert đã `CANCELLED` → response `200`, **không** phát thêm sự kiện.
7. `GET /admin/concerts/:id/stats` sau khi có đơn `PAID` → `totalRevenue` và `soldQty` per type phản ánh đúng số liệu; sau khi mua thêm → cập nhật ngay (không có cache delay vì đây là aggregate trực tiếp từ DB).
