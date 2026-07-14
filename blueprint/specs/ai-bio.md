# Đặc tả tạo tiểu sử nghệ sĩ bằng AI

## 1. Mô tả

Ban tổ chức tải press kit dạng PDF; backend trích xuất văn bản, gửi prompt tiếng Việt đến nhà cung cấp AI đã cấu hình và lưu kết quả vào `Concert.artistBio`. Mã nguồn nằm trong `src/backend/src/ai-bio/`.

## 2. Luồng chính

1. `ORGANIZER` gửi file PDF bằng multipart field `pdf` tới `POST /concerts/:id/bio`.
2. Controller kiểm tra loại file và giới hạn tối đa 20 MB.
3. `pdf-parse` trích xuất, chuẩn hóa và cắt nội dung còn tối đa 8.000 ký tự.
4. `AI_PROVIDER` chọn một trong `anthropic`, `gemini`, `openai`; `AI_MODEL` có thể ghi đè model mặc định.
5. Backend gọi REST API tương ứng với prompt yêu cầu viết 4–5 câu tiếng Việt.
6. Kết quả được lưu vào `Concert.artistBio` và trả về dưới dạng `{ bio }`; trang chi tiết concert hiển thị nội dung này.

## 3. Kịch bản lỗi

- Thiếu file, sai định dạng, PDF hỏng/khóa mật khẩu hoặc không có văn bản → `400 Bad Request`.
- Concert không tồn tại → hiện trả `400 Bad Request` từ `AiBioService`.
- Thiếu API key, provider lỗi, timeout hoặc bị giới hạn tần suất → backend ghi log và tạo nội dung dự phòng từ 200 ký tự đầu của PDF; request không làm tiến trình bị sập.
- File trên 20 MB → Multer từ chối upload.

## 4. Ràng buộc

- Request hiện chờ đồng bộ phản hồi AI; chưa đưa tác vụ này vào BullMQ.
- Chuyển provider chỉ bằng biến môi trường, không sửa mã nguồn.
- Nội dung PDF gửi ra dịch vụ AI bên thứ ba, vì vậy dữ liệu nhạy cảm phải được xem xét trước khi upload.
- Các model mặc định trong code hiện là `claude-haiku-4-5-20251001`, `gemini-3.1-flash-lite` và `gpt-4o-mini`; có thể đổi bằng `AI_MODEL`.

## 5. Tiêu chí chấp nhận

- Upload PDF hợp lệ bằng tài khoản `ORGANIZER` cập nhật `Concert.artistBio` và trả `{ bio }`.
- Đổi `AI_PROVIDER` cùng API key phù hợp sẽ chuyển nhà cung cấp.
- Khi không có key hoặc API AI lỗi, hệ thống lưu nội dung dự phòng thay vì crash.
- `AUDIENCE` hoặc `SCANNER` gọi endpoint → `403`; không đăng nhập → `401`.
