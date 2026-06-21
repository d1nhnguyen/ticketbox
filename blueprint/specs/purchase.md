# Đặc tả: Luồng mua vé & Kiểm soát đồng thời (Purchase Flow & Concurrency Spec)

## Mô tả
Tính năng này cho phép khán giả chọn loại vé và số lượng để mua cho một concert cụ thể, khởi tạo đơn hàng ở trạng thái `PENDING` (giữ vé trong 10 phút) trước khi thực hiện thanh toán qua cổng thanh toán.

## Luồng chính
1. Khán giả chọn concert, loại vé và số lượng vé mong muốn (ví dụ: SVIP, số lượng = 2).
2. Hệ thống kiểm tra xem thời điểm mở bán của loại vé này đã bắt đầu hay chưa.
3. Hệ thống kiểm tra giới hạn mua vé của tài khoản khán giả (`maxPerUser`).
4. Hệ thống kiểm tra số lượng vé còn lại trong kho (`remainingQty`).
5. Nếu mọi điều kiện hợp lệ, hệ thống thực hiện giảm số lượng vé còn lại một cách nguyên tử (atomic decrement) và tạo đơn hàng `PENDING` kèm thời hạn hết hạn là 10 phút.
6. Kết quả đơn hàng được lưu vào Redis cache với `Idempotency-Key` của request.
7. Đơn hàng được trả về cho client để thực hiện thanh toán qua cổng thanh toán.

## Kịch bản lỗi
1. **Vé đã bán hết (Sold out):** Hệ thống trả về lỗi `409 Conflict` kèm thông báo "Sold out".
2. **Vượt quá giới hạn mua per-user (Limit Exceeded):** Hệ thống trả về lỗi `400 Bad Request` kèm thông báo chi tiết số vé đã mua/đã giữ.
3. **Đơn hàng trùng lặp đang xử lý (Duplicate in process):** Gửi request với cùng `Idempotency-Key` khi request trước chưa xử lý xong → Trả về lỗi `409 Conflict` "Duplicate request still processing".
4. **Lỗi thanh toán thất bại:** Nếu thanh toán thất bại hoặc quá hạn 10 phút, trạng thái đơn hàng chuyển sang `FAILED` hoặc `EXPIRED` và số lượng vé giữ được hoàn lại kho (`remainingQty` tăng lại).

## Ràng buộc & Cơ chế Kỹ thuật
- **Oversell Guard (Cơ chế #1):** Dùng conditional update `remainingQty: { gte: quantity }` bên trong transaction để loại bỏ hoàn toàn race condition khi bán vé cuối cùng.
- **Per-user limit under load (Cơ chế #6):** Thực hiện khóa dòng `SELECT * FROM "TicketType" WHERE id = ? FOR UPDATE` để tuần tự hóa (serialize) các transaction mua của cùng loại vé, đảm bảo đếm chính xác số lượng vé một tài khoản đã đặt và ngăn chặn lách luật bằng request song song.
- **Idempotency Key (Cơ chế #4a):** Dùng Redis làm bộ nhớ đệm phân tán để kiểm soát trùng lặp thông qua `Idempotency-Key`. Trả về cùng một kết quả giao dịch nếu client gửi trùng key.

## Tiêu chí chấp nhận
1. Chạy song song nhiều request mua vé của cùng một tài khoản → Tổng số vé được mua/giữ thành công không bao giờ vượt quá `maxPerUser`.
2. Chạy song song nhiều request mua vé của nhiều tài khoản khác nhau khi số lượng vé sắp hết → Số vé bán ra không vượt quá số lượng vé thực tế trong kho, không có vé âm.
3. Gửi 2 request giống hệt nhau với cùng một `Idempotency-Key` cùng lúc hoặc liên tiếp → Chỉ tạo 1 đơn hàng duy nhất trong database và không trừ tiền/giữ vé 2 lần.
