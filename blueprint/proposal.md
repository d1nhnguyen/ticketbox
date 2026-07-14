# TicketBox — Đề xuất dự án

## 1. Vấn đề

Nhiều ban tổ chức sự kiện nhỏ và vừa vẫn ghép nối Google Form, Zalo OA và chuyển khoản thủ công. Khi lượng truy cập tăng, quy trình này bộc lộ các vấn đề:

- **Quá tải:** biểu mẫu hoặc máy chủ nhỏ có thể sập đúng thời điểm mở bán.
- **Bán vượt kho và sai lệch dữ liệu:** xác nhận chuyển khoản chậm khiến khách đã trả tiền nhưng không nhận được vé.
- **Đầu cơ:** thiếu giới hạn mua và rate limiting tạo điều kiện cho bot gom vé.
- **Soát vé hỗn loạn:** mạng tại địa điểm tổ chức dễ quá tải, làm giải pháp chỉ hoạt động trực tuyến bị tê liệt.

## 2. Mục tiêu

- **Khả năng chịu tải:** hướng tới kịch bản 80.000 request trong 5 phút mà hệ thống không sập.
- **Nhất quán dữ liệu:** không bán vượt `remainingQty` ngay cả khi nhiều request đồng thời.
- **Không thu tiền hai lần:** thao tác lặp lại được bảo vệ bằng idempotency ở Redis, PostgreSQL và trạng thái đơn.
- **Soát vé ngoại tuyến:** PWA tải trước snapshot, quét bằng IndexedDB và đồng bộ khi có mạng.
- **Cô lập lỗi:** lỗi cổng thanh toán, SMTP hoặc worker không làm tê liệt chức năng duyệt concert.

## 3. Người dùng và nhu cầu

1. **Khán giả:** xem concert công khai, tạo và thanh toán đơn, nhận e-ticket QR, xem đơn và thông báo.
2. **Ban tổ chức:** quản lý concert, loại vé, tiểu sử nghệ sĩ, danh sách khách mời CSV và thống kê doanh thu.
3. **Nhân viên soát vé:** đăng nhập PWA, chọn concert, tải snapshot vé/khách VIP, quét offline và xử lý xung đột sau đồng bộ.

## 4. Phạm vi

- Backend NestJS dạng modular monolith; Prisma/PostgreSQL; Redis cho token bucket, cache-aside, idempotency và BullMQ.
- Web React/Vite cho khán giả và ban tổ chức; Scanner PWA React/Vite dùng Dexie/IndexedDB.
- Bảy cơ chế trọng tâm: chống oversell, rate limiting, circuit breaker, idempotency, giới hạn mỗi người dùng, đồng bộ offline và cache-aside; bổ sung pipeline CSV cùng thông báo bất đồng bộ.
- Cổng mock là luồng thanh toán mặc định; VNPay sandbox là tích hợp tùy chọn khi có cấu hình merchant.
- Chạy cục bộ bằng Docker Compose với PostgreSQL, Redis, Mailpit, mock gateway, backend, web và scanner.

## 5. Ngoài phạm vi

- MoMo và thanh toán tiền thật trong production.
- Ứng dụng native iOS/Android; dự án dùng PWA.
- Chọn ghế cụ thể; kho được quản lý theo `TicketType`/khu vực.
- Hạ tầng production nhiều vùng, object storage hoặc file watcher phân tán.
- Microservices, Kafka/RabbitMQ và hệ thống hoàn tiền tài chính hoàn chỉnh.

## 6. Rủi ro và ràng buộc

1. **Tranh chấp vé cuối:** khóa dòng `TicketType` và conditional decrement trong transaction.
2. **Traffic spike/bot:** token bucket Redis theo IP hoặc người dùng; giới hạn endpoint nhạy cảm chặt hơn.
3. **Cổng thanh toán lỗi:** Circuit Breaker trả nhanh `503`, đơn giữ `PENDING` để retry.
4. **Request lặp:** khóa idempotency Redis TTL 24 giờ, unique key DB và conditional state transition.
5. **Mạng cổng sự kiện yếu:** snapshot IndexedDB và hàng đợi đồng bộ; hai thiết bị cùng offline vẫn chỉ phát hiện trùng khi sync.
6. **CSV xấu/trùng:** checksum theo concert, retry BullMQ và cô lập lỗi từng dòng.
7. **Đọc nhiều:** cache-aside Redis cho danh sách/chi tiết concert; phần lớn luồng ghi chủ động invalidation, riêng cập nhật trực tiếp loại vé hiện còn phụ thuộc TTL chi tiết 60 giây.

Cổng mock chỉ thay nhà cung cấp thanh toán bên thứ ba; các cơ chế bảo vệ vẫn là triển khai thật và có thể kiểm thử qua HTTP.
