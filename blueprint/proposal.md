# TicketBox — Project Proposal

## 1. Vấn đề (The Problem)

Hiện nay, nhiều ban tổ chức (BTC) sự kiện nhỏ và vừa đang phải vật lộn với các quy trình bán vé thủ công chắp vá. Các giải pháp như sử dụng Google Form để thu thập thông tin, Zalo OA để giao tiếp và yêu cầu khách hàng chuyển khoản ngân hàng thủ công bộc lộ nhiều điểm yếu chí mạng khi quy mô tăng lên:
- **Hệ thống quá tải (Crashes):** Google Form hoặc các máy chủ tự dựng nhỏ lẻ thường sập khi có lượng lớn người truy cập cùng lúc vào thời điểm mở bán vé.
- **Tiền mất vé không có (Oversell & Data Inconsistency):** Xử lý chuyển khoản ngân hàng thủ công chậm trễ, dẫn đến tình trạng bán vượt quá số lượng vé thực tế. Khách hàng đã chuyển tiền nhưng không nhận được vé, gây ra sự phẫn nộ và khủng hoảng truyền thông.
- **Gian lận và Đầu cơ (Scalper bots):** Không có cơ chế chặn bot đầu cơ gom vé, dẫn đến việc khán giả thực sự không thể mua được vé với giá gốc.
- **Check-in hỗn loạn:** Tại sự kiện, mạng di động hoặc wifi thường xuyên bị quá tải. Các giải pháp check-in online hoàn toàn bị tê liệt, gây ùn tắc tại cổng soát vé.

## 2. Mục tiêu (Goals)

Dự án TicketBox ra đời nhằm giải quyết triệt để các vấn đề trên bằng một hệ thống phân phối vé mạnh mẽ, đáng tin cậy. Các mục tiêu cụ thể bao gồm:
- **High Availability & Scalability:** Chịu tải tối đa lên đến 80,000 requests/5 phút mà không sập hệ thống.
- **Data Consistency (Zero Oversell):** Đảm bảo tính toàn vẹn dữ liệu, không bao giờ bán quá số lượng vé tồn kho ngay cả trong môi trường có tính đồng thời cao.
- **No Double Charge:** Xử lý thanh toán an toàn, đảm bảo khách hàng không bao giờ bị trừ tiền hai lần cho một giao dịch, dù cho kết nối mạng chập chờn hay API của cổng thanh toán phản hồi chậm.
- **Offline Check-in:** Giải pháp soát vé PWA có khả năng hoạt động hoàn toàn offline, đảm bảo tốc độ qua cổng và sau đó tự động đồng bộ khi có mạng, ngăn chặn các trường hợp dùng chung mã QR.

## 3. Người dùng và Nhu cầu (Users & Needs)

Hệ thống phục vụ 3 nhóm người dùng chính:
1. **Khán giả (Audience):** 
   - Mua vé nhanh chóng, công bằng, không bị nghẽn mạng hay lỗi thanh toán.
   - Quản lý vé điện tử dễ dàng (e-ticket QR code) và nhận thông báo về sự kiện.
2. **Ban tổ chức (Organizer / Admin):**
   - Quản lý sự kiện, hạng vé, theo dõi doanh thu và trạng thái bán vé theo thời gian thực.
   - Quản lý danh sách khách mời đặc biệt (VIP) thông qua việc import file CSV một cách an toàn.
3. **Nhân viên soát vé (Scanner):**
   - Soát vé nhanh chóng bằng camera thiết bị di động, ứng dụng vẫn phải hoạt động mượt mà ngay cả khi không có kết nối internet tại địa điểm tổ chức.
   - Soát vé dựa trên danh sách khách mời (VIP list).

## 4. Phạm vi / Ngoài phạm vi (Scope & Out of Scope)

**Trong phạm vi (In Scope):**
- Xây dựng 7 cơ chế kỹ thuật cốt lõi: Rate Limiting, Idempotency, Circuit Breaker, Offline Sync, Concurrent Booking, CSV Ingestion, Caching.
- Ứng dụng Backend API, Web cho Admin/Audience, và PWA cho Scanner.
- Triển khai cục bộ trên môi trường `docker-compose`.
- Mock API Gateway để mô phỏng tích hợp thanh toán có tỷ lệ rớt/delay.

**Ngoài phạm vi (Out of Scope):**
- Không tích hợp cổng thanh toán thật (VNPay, MoMo) mà sử dụng Mock Gateway.
- Không xây dựng Native Mobile App (iOS/Android), thay vào đó là PWA (Progressive Web App).
- Không chọn ghế cụ thể (Not per-seat assignment), thay vào đó quản lý số lượng theo khu vực (Zone/Ticket Type).
- Không triển khai trên hạ tầng cloud thực tế (No production infra).

## 5. Rủi ro và Ràng buộc (Risks & Constraints)

Dự án phải vượt qua 7 bài toán kỹ thuật (được coi là các cơ chế cốt lõi để bảo vệ hệ thống):
1. **Oversell Prevention:** Xử lý Race Condition khi nhiều người cùng tranh mua vé cuối cùng.
2. **Traffic Spikes:** Chống DDoS, Rate Limiting bảo vệ tài nguyên.
3. **Third-party Gateway Failures:** Khả năng chịu đựng khi cổng thanh toán sập (Circuit Breaker).
4. **Idempotency & Double-charge:** Giao dịch an toàn khi có retry (thanh toán) và chống check-in lặp (Offline Double-scan).
5. **Data Ingestion:** Upload và xử lý an toàn danh sách CSV lớn (Validation, Idempotency, No-crash).
6. **Per-user Limits:** Tránh bot đầu cơ gom số lượng lớn vé trong một thời điểm.
7. **Read-heavy Overload:** Tối ưu hóa Database bằng cơ chế Caching (Redis cache-aside) để giảm tải khi người dùng liên tục F5.
