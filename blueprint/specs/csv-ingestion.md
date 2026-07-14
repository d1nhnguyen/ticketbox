# Đặc tả nhập danh sách khách mời CSV

## 1. Mô tả

Thành phần nhập danh sách khách VIP theo concert, cô lập lỗi từng dòng và chống nhập trùng theo SHA-256. File có thể đến từ thư mục được quét định kỳ hoặc upload thủ công; cả hai đi qua cùng `GuestsService.ingestBuffer` và worker `GuestsProcessor`.

## 2. ADR: Một pipeline cho thư mục định kỳ và upload

- **Bối cảnh:** Yêu cầu có luồng nhập định kỳ, không chỉ thao tác thủ công từ giao diện quản trị.
- **Quyết định:** `InboxPollerService` chạy `@Cron(EVERY_10_SECONDS)`, quét `CSV_INBOX_DIR` (mặc định `/data/inbox`, bind mount từ `./data/inbox`). File mới và endpoint `POST /admin/concerts/:concertId/guests/upload` cùng gọi `GuestsService.ingestBuffer`.
- **Lý do:** Dùng chung checksum, `CsvImportBatch`, queue `guests` và logic parse; nguồn file không làm thay đổi pipeline xử lý.
- **Quy ước concert:** Tên file inbox có dạng `<concert-slug>__anything.csv`; nếu không có `__`, toàn bộ basename là slug.
- **Hệ quả:** Cron chỉ phát hiện và chuyển file; việc parse vẫn do BullMQ worker thực hiện. Đây là cơ chế polling một instance, không phải file watcher phân tán.

## 3. Luồng chính

### 3.1. Thư mục định kỳ

1. Chép file vào `data/inbox/` trên host.
2. Mỗi 10 giây poller liệt kê file, bỏ qua dotfile, thư mục con và file được sửa trong 3 giây gần nhất để tránh đọc lúc đang chép. Cờ nội bộ ngăn hai lượt poll chồng nhau.
3. Poller suy ra slug, tìm concert, đọc buffer và tính SHA-256.
4. Nếu chưa có batch `(concertId, checksum)`, poller gọi `ingestBuffer`; file gốc được giữ tại inbox trong khi worker chạy.
5. Các lượt sau kiểm tra batch: `PROCESSING` thì giữ nguyên, `SUCCESS` chuyển sang `processed/`, `FAILED` chuyển sang `failed/`.
6. Nội dung giống hệt cho cùng concert được chuyển thẳng sang `processed/`; cùng nội dung vẫn được nhập cho concert khác.

### 3.2. Upload thủ công

1. `ORGANIZER` upload multipart field `file` tới `POST /admin/concerts/:concertId/guests/upload`.
2. Service kiểm tra concert rồi gọi `ingestBuffer`.
3. Checksum đã tồn tại cho concert → `409 Conflict`; nếu mới, tạo `CsvImportBatch(PROCESSING)`, ghi file tạm `uploads/<batchId>.csv` và enqueue job `guests.import` với tối đa 3 lần thử.

### 3.3. Worker dùng chung

1. `GuestsProcessor` đọc stream bằng `csv-parser`, yêu cầu header `fullName` và `zone`; `docId` không bắt buộc.
2. Dòng thiếu trường bắt buộc bị tính vào `rowsFailed`, các dòng khác vẫn tiếp tục.
3. Trong file, trùng được xác định theo `docId`, hoặc theo `fullName` nếu không có `docId`. Sau đó worker đối chiếu tiếp với dữ liệu đã có của cùng concert.
4. Dòng hợp lệ được chèn hàng loạt bằng `createMany({ skipDuplicates: true })` với `sourceBatchId`.
5. Batch được cập nhật `SUCCESS` cùng `rowsTotal`, `rowsOk`, `rowsFailed`; lỗi cuối cùng sau retry đổi thành `FAILED`. File tạm bị xóa ở cả hai kết quả.

## 4. Kịch bản lỗi

- Nội dung trùng trong cùng concert → inbox chuyển sang `processed/`, upload trả `409`.
- Dòng hỏng → chỉ dòng đó thất bại; batch vẫn có thể `SUCCESS` với `rowsFailed > 0`.
- Thiếu header bắt buộc hoặc CSV lỗi → worker retry 3 lần rồi đánh dấu `FAILED`; poller chuyển file vào `failed/`.
- Lỗi ghi file tạm/enqueue → xóa file tạm và đổi batch vừa tạo sang `FAILED`.
- Slug không tồn tại hoặc file không phải `.csv` → chuyển thẳng sang `failed/`, không tạo batch.
- Worker dừng giữa chừng → BullMQ retry khi tiến trình hoạt động lại; unique `(concertId, checksum)` ngăn tạo batch trùng.

## 5. Ràng buộc

- Gateway hiện buffer toàn bộ file để băm và ghi file tạm; worker mới parse bằng stream. Phạm vi dự án giả định danh sách nhỏ và hiện chưa đặt giới hạn upload CSV rõ ràng.
- Unique DB của `GuestListEntry` là `(concertId, docId, sourceBatchId)`. Vì PostgreSQL coi các giá trị `NULL` là khác nhau, dedup khách không có `docId` được thực hiện ở tầng ứng dụng theo `fullName` trong cùng concert.
- Poller một instance với cờ chống re-entry phù hợp phạm vi hiện tại; triển khai nhiều backend cần cơ chế leader/distributed lock.
- Các thư mục `processed/` và `failed/` nằm dưới inbox và tên file được thêm timestamp khi di chuyển.

## 6. Tiêu chí chấp nhận

- Chép file `<slug>__anything.csv` hợp lệ vào `data/inbox/` sẽ tạo danh sách trong một chu kỳ poll và chuyển file sang `processed/`.
- Dòng sai không làm mất các dòng đúng; số đếm batch phản ánh kết quả.
- File trùng cùng concert không tạo khách/batch mới; cùng nội dung cho concert khác vẫn được phép.
- File sai định dạng, không phải CSV hoặc có slug lạ không làm backend crash và được chuyển vào `failed/`.
- Upload từ giao diện quản trị vẫn hoạt động; upload lại cùng nội dung trả `409 Conflict`.
- Scanner có thể tải danh sách qua `GET /concerts/:id/guests`, xác minh qua `POST /guests/verify` và check-in VIP qua `POST /guests/check-in`.
