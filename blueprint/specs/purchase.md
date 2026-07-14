# Đặc tả luồng mua vé và kiểm soát đồng thời

## Mô tả

Khán giả chọn một loại vé và số lượng, tạo đơn `PENDING` giữ kho trong 10 phút rồi xác nhận bằng cổng mock hoặc VNPay tùy cấu hình.

## Luồng chính

1. Client gửi `POST /orders` với `{ ticketTypeId, quantity }`, JWT `AUDIENCE` và header `Idempotency-Key`.
2. Redis nhận khóa `idemp:<key>` bằng `SET NX EX 86400`; key đang xử lý trả `409`, key đã hoàn tất trả lại đúng kết quả cũ.
3. Trong transaction, backend khóa dòng `TicketType` bằng `SELECT ... FOR UPDATE`, kiểm tra thời gian mở bán và tổng số vé `PAID` cộng `PENDING` chưa hết hạn của người dùng.
4. `updateMany` chỉ giảm `remainingQty` khi còn đủ kho, sau đó tạo `Order(PENDING)`, `OrderItem` và `expiresAt = now + 10 phút`.
5. Sau commit, kết quả được lưu Redis 24 giờ và cache concert được vô hiệu hóa.
6. Job lặp `release-expired` trên queue `orders` chạy mỗi phút, chuyển đơn hết hạn sang `EXPIRED` và hoàn kho.

## Kịch bản lỗi

- Thiếu `Idempotency-Key` → `400 Bad Request`.
- Loại vé không tồn tại → `404 Not Found`; chưa tới `saleStartsAt` → `400 Bad Request`.
- Không đủ kho → `409 Conflict` (`Sold out`).
- Vượt `maxPerUser` → `400 Bad Request` với số lượng đã mua/giữ.
- Cùng key đang xử lý → `409 Conflict`; sau lỗi transaction, Redis key được xóa để client có thể retry thật.
- Thanh toán thất bại hoặc đơn hết hạn → `FAILED`/`EXPIRED` và hoàn `remainingQty` đúng một lần.

## Ràng buộc và cơ chế kỹ thuật

- **Chống oversell:** conditional decrement trong transaction; kho không thể âm.
- **Giới hạn mỗi người dùng khi có tải:** khóa dòng loại vé tuần tự hóa các giao dịch cùng loại trước khi đếm `PAID` và `PENDING` còn hạn.
- **Idempotency:** Redis là đường nhanh; unique nullable `Order.idempotencyKey` trong PostgreSQL là lớp chặn bền vững.
- **Rate limiting:** `POST /orders` dùng token bucket theo người dùng với capacity 150 và refill 10 token/giây.
- Mỗi đơn hiện chứa một `OrderItem` vì DTO mua chỉ nhận một `ticketTypeId`.

## Tiêu chí chấp nhận

- Request song song của một tài khoản không vượt `maxPerUser`.
- Request song song của nhiều tài khoản không bán vượt kho và không tạo `remainingQty` âm.
- Hai request cùng `Idempotency-Key` chỉ tạo một đơn và giữ kho một lần; request lặp sau đó nhận cùng kết quả.
- Đơn hết hạn được worker chuyển `EXPIRED` và hoàn kho; chạy worker lại không hoàn lần hai.
