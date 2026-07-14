# Đặc tả thanh toán và Circuit Breaker

## 1. Mô tả

Luồng mặc định gọi cổng thanh toán mô phỏng qua `PaymentGatewayService`, được bảo vệ bằng Circuit Breaker `opossum`. Khi cổng chậm hoặc lỗi, chỉ chức năng thanh toán suy giảm; API duyệt concert vẫn hoạt động. VNPay sandbox là lựa chọn bổ sung khi được bật bằng cấu hình.

### Lập luận thiết kế

- Chỉ đặt timeout vẫn tiếp tục dồn request vào gateway đang lỗi; retry vô hạn gây retry storm. Circuit Breaker được chọn để nhớ trạng thái dependency và fail-fast trong thời gian lỗi kéo dài.
- Payment adapter giữ code nghiệp vụ độc lập provider; mỗi provider production nên có circuit riêng để lỗi VNPay không mở circuit của MoMo.
- Bản hiện tại có mock và VNPay sandbox tùy chọn; MoMo mới là điểm mở rộng kiến trúc, chưa được tuyên bố là tích hợp đã cài đặt.
- Không đưa public read vào cùng dependency chain, nên graceful degradation là: concert vẫn `200`, payment trả `503`, order còn `PENDING` trong thời gian giữ chỗ.
- Mặc định `timeout=5s`, `errorThreshold=50%`, `volumeThreshold=5`, `resetTimeout=10s` giúp demo nhanh. Đây không phải ngưỡng production; cần hiệu chỉnh bằng p95 gateway, error budget và metric false-open.
- Idempotency/conditional state transition vẫn bắt buộc vì Circuit Breaker chỉ cô lập lỗi, không ngăn tác dụng phụ lặp khi response thanh toán bị mất.

## 2. Luồng chính

1. Khán giả tạo đơn bằng `POST /orders`; hệ thống tạo `Order(PENDING)` và giữ kho trong 10 phút.
2. Với phương thức mock, khán giả gọi `POST /orders/:id/confirm`. Backend kiểm tra quyền sở hữu và trạng thái đơn trước khi gọi cổng.
3. Circuit Breaker bọc lời gọi `POST /pay` tới service `mock-gateway`, chuyển tiếp `orderId`, `amount` và `idempotencyKey` của đơn.
4. Khi thành công, transaction đổi `PENDING → PAID` có điều kiện, phát hành các `Ticket` với `qrCode` UUID và phát sự kiện `order.paid`.
5. Gọi xác nhận lại đơn đã `PAID` trả chính đơn đó và không thu tiền hay phát hành vé lần nữa.
6. Nếu VNPay được bật, `GET /orders/vnpay/url/:id` tạo URL thanh toán và `GET /orders/vnpay/return` xác minh kết quả trả về.

## 3. Kịch bản lỗi

- Gateway timeout hoặc đủ tỷ lệ lỗi → circuit chuyển `OPEN`; fallback trả `503 Service Unavailable`, đơn vẫn `PENDING` để thử lại.
- Hết thời gian reset (mặc định 10 giây) → circuit `HALF-OPEN` cho phép yêu cầu thăm dò; thành công thì đóng, thất bại thì mở lại.
- Gateway trả lỗi cứng hoặc kết quả `failed` → đơn chuyển `FAILED` và kho giữ chỗ được hoàn lại.
- Đơn đã hết hạn/không còn `PENDING` → không được xác nhận.
- Hai lời gọi xác nhận đồng thời được chặn phát hành vé trùng bằng phép đổi trạng thái có điều kiện trong transaction; `idempotencyKey` cũng được chuyển đến gateway.

## 4. Ràng buộc

- Các biến chính: `MOCK_PAYMENT_URL`, `CIRCUIT_BREAKER_TIMEOUT_MS`, `CIRCUIT_BREAKER_ERROR_THRESHOLD`, `CIRCUIT_BREAKER_RESET_TIMEOUT_MS`, `CIRCUIT_BREAKER_VOL_THRESHOLD`.
- Endpoint quan sát là `GET /payment/status`; reset demo là `POST /payment/reset` và chỉ hoạt động khi `ENABLE_DEMO_ENDPOINTS=true`.
- Chế độ mock gateway được đổi tại `POST http://localhost:4000/admin/mode` với payload như `{ "mode": "failure" }`.
- Idempotency tạo đơn dùng Redis TTL 24 giờ và unique `Order.idempotencyKey`; idempotency xác nhận thanh toán dựa thêm vào trạng thái đơn trong PostgreSQL.

## 5. Tiêu chí chấp nhận

- Với ngưỡng volume mặc định 5 và gateway liên tục lỗi, circuit mở sau khi đạt điều kiện ngưỡng lỗi.
- Khi circuit mở, `GET /concerts` không bị ảnh hưởng và thanh toán trả nhanh `503`.
- Xác nhận lại cùng đơn đã thanh toán không thu tiền hoặc phát hành vé lần hai.
- Test tải `scripts/load-test/circuit-breaker.js` thể hiện phản hồi `503` thay vì làm nghẽn event loop.
