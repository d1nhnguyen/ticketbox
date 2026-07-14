# Đặc tả thông báo

## 1. Mô tả

Hệ thống gửi email và thông báo trong ứng dụng bất đồng bộ qua BullMQ. Hai kênh hiện tại triển khai chung giao diện `NotificationChannel`: `EmailChannel` dùng Nodemailer/SMTP và `InAppChannel` ghi PostgreSQL. Trong Docker Compose, Mailpit nhận email phát triển tại cổng SMTP `1025` và hiển thị giao diện ở `http://localhost:8025`.

## 2. Luồng chính

1. `NotificationsListener` nhận sự kiện `order.paid` hoặc `concert.cancelled` từ `EventEmitter2`.
2. Listener đưa job `notification.send` vào queue `notifications` cho từng kênh `EMAIL` và `IN_APP`.
3. `NotificationsProcessor` lấy job và gọi `NotificationsService`, service chọn channel từ map chiến lược.
4. `EmailChannel` lấy email người nhận, dựng HTML; email đơn đã thanh toán đính kèm QR PNG cho từng vé. `InAppChannel` tạo bản ghi `Notification` ở trạng thái `SENT`.
5. Cron `*/15 * * * *` quét concert `ON_SALE` trong cửa sổ từ 23 giờ 45 đến 24 giờ 15, rồi gọi `enqueueOnce` để tạo thông báo `REMINDER_24H` trong ứng dụng cho các đơn `PAID`.

## 3. Kịch bản lỗi

- Email SMTP lỗi hoặc worker gặp lỗi → job email được thử lại tối đa 3 lần với exponential backoff.
- Không tìm thấy người nhận, đơn `PAID` hoặc vé đã phát hành khi dựng email → job lỗi để BullMQ retry.
- Channel không đăng ký → service ghi cảnh báo và bỏ qua.
- Tiến trình backend khởi động lại → job bền vững còn trong Redis sẽ tiếp tục được xử lý.

## 4. Ràng buộc

- Gửi thông báo không được chặn request nghiệp vụ tạo/hủy đơn.
- Thêm channel mới cần triển khai `NotificationChannel` và đăng ký trong `NotificationsService`.
- Nhắc lịch chống trùng bằng truy vấn `Notification(userId, type, payload.concertId)` trước khi enqueue. Đây là kiểm tra ở tầng ứng dụng, chưa có unique constraint DB nên nhiều instance cron đồng thời vẫn có thể tạo race condition.
- Worker thông báo hiện nằm trong cùng tiến trình NestJS backend, không phải service triển khai riêng.

## 5. Tiêu chí chấp nhận

- Thanh toán thành công tạo thông báo `IN_APP` và gửi email chứa thông tin đơn cùng QR vé.
- Hủy concert gửi email và thông báo trong ứng dụng cho từng người mua có đơn `PAID`.
- Cron chỉ nhắc concert `ON_SALE` trong cửa sổ 24 giờ và không tạo lại khi bản ghi tương ứng đã tồn tại.
- Email có thể quan sát trong Mailpit ở môi trường Docker Compose.
