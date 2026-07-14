Dưới đây là toàn bộ nội dung đề bài Đồ án môn học – **TicketBox** được cấu trúc và định dạng lại hoàn chỉnh bằng Markdown, giúp bạn dễ dàng lưu trữ, theo dõi và đưa vào file hướng dẫn hoặc tài liệu quản lý dự án (như GitHub/GitLab Wiki hoặc Notion).

---

# ĐỒ ÁN MÔN HỌC: TICKETBOX

## 1. Bối cảnh

Các concert âm nhạc lớn tại Việt Nam — như _Anh Trai Say Hi, Anh Trai Vượt Ngàn Chông Gai, Em Xinh Say Hi, Chị Đẹp Đạp Gió Rẽ Sóng_ — thu hút hàng chục nghìn khán giả.

- **Thực trạng:** Khi ban tổ chức (BTC) mở bán vé, website thường sập trong vài phút đầu do lượng truy cập đồng thời quá lớn; khán giả bị trừ tiền nhưng không nhận được vé; đầu nậu (scalper) dùng bot mua hết vé trong vài giây rồi bán lại với giá gấp nhiều lần.
- **Hạn chế hiện tại:** Nhiều sự kiện vẫn bán vé qua các kênh rời rạc (Zalo OA, Google Form, chuyển khoản thủ công) — không đảm bảo tính công bằng và rất dễ xảy ra gian lận.
- **Mục tiêu:** Công ty tổ chức sự kiện muốn xây dựng hệ thống **TicketBox** để số hóa toàn bộ quy trình bán vé, từ lúc mở bán đến khi khán giả vào cổng sự kiện.

---

## 2. Người dùng

| Nhóm người dùng       | Mô tả công việc                                                            |
| --------------------- | -------------------------------------------------------------------------- |
| **Khán giả**          | Xem thông tin concert, mua vé, nhận e-ticket, check-in tại cổng.           |
| **Ban tổ chức (BTC)** | Tạo và quản lý concert, cấu hình loại vé, theo dõi doanh thu và lượng bán. |
| **Nhân sự soát vé**   | Xác nhận vé tại cổng vào bằng ứng dụng di động (mobile app).               |

---

## 3. Yêu cầu hệ thống

### Xem và mua vé

- **Hiển thị:** Khán giả có thể xem danh sách các concert sắp diễn ra, bao gồm thông tin nghệ sĩ biểu diễn, địa điểm tổ chức, sơ đồ chỗ ngồi (sơ đồ SVG tương tác theo khu: _GA, SVIP, VIP, CAT1, CAT2_) và số vé còn lại theo thời gian thực cho từng loại.
- **Thanh toán:** Khán giả chọn loại vé và số lượng, sau đó tiến hành thanh toán qua cổng thanh toán (VNPAY, MoMo). Sau khi thanh toán thành công, khán giả nhận e-ticket dưới dạng mã QR dùng để vào cổng sự kiện.
- **Ràng buộc số lượng:** Mỗi tài khoản chỉ được mua tối đa một số lượng vé nhất định cho mỗi loại vé, do BTC cấu hình khi tạo concert (Ví dụ: _SVIP tối đa 2 vé/tài khoản, CAT1 tối đa 4 vé/tài khoản_). Giới hạn này áp dụng trên toàn bộ các đơn hàng đã thanh toán thành công — khán giả không thể lách bằng cách tạo nhiều đơn hàng nhỏ.

### Thông báo

- Sau khi mua vé thành công, khán giả nhận thông báo xác nhận qua app và email kèm e-ticket.
- Khi concert sắp diễn ra (trước 24 giờ), hệ thống gửi nhắc nhở tự động.
- **Kiến trúc:** Hệ thống cần được thiết kế để dễ dàng bổ sung kênh thông báo mới (Ví dụ: _Zalo OA, SMS_) trong tương lai mà không cần thay đổi lớn.

### Quản trị

- BTC dùng trang web admin để tạo concert mới, cấu hình các loại vé (tên, giá, số lượng, thời điểm mở bán), cập nhật thông tin, hoặc hủy concert.
- **Phân quyền nghiêm ngặt (RBAC):** Trang admin chỉ dành cho nội bộ và cần kiểm soát truy cập chặt chẽ với 3 nhóm quyền:
- _Khán giả:_ Chỉ có thể xem thông tin và mua vé.
- _Ban tổ chức:_ Quyền tạo, sửa, hủy concert và xem thống kê doanh thu.
- _Nhân sự soát vé:_ Chỉ có quyền truy cập chức năng quét mã QR.

### Soát vé tại sự kiện

- Nhân sự tại cổng vào dùng mobile app để quét mã QR trên e-ticket của khán giả.
- **Offline-first:** Các địa điểm tổ chức concert lớn (sân vận động, nhà thi đấu) thường có vùng sóng không ổn định khi hàng chục nghìn người tập trung — app phải cho phép ghi nhận soát vé tạm thời khi không có mạng và tự đồng bộ lại khi kết nối được phục hồi.

### AI Artist Bio

- BTC có thể tải lên file PDF hồ sơ nghệ sĩ hoặc press kit của concert.
- Hệ thống tự động xử lý, tách nội dung, làm sạch văn bản và gửi sang mô hình AI để tạo bản giới thiệu ngắn gọn hiển thị trên trang chi tiết concert.

### Đồng bộ danh sách khách mời VIP

- Một số concert có khu vực _Guest List_ dành cho khách mời của nhãn hàng tài trợ.
- Do hệ thống quản lý khách mời của nhãn hàng không có API, cách duy nhất là nhận file CSV mà nhãn hàng gửi vào ban đêm trước ngày diễn.
- TicketBox cần định kỳ nhập danh sách này để nhân sự soát vé có thể xác nhận khách mời tại cổng VIP.

---

## 4. Các vấn đề kỹ thuật cần giải quyết

1. **Tranh chấp vé (Race Condition):** Một số loại vé SVIP chỉ có 200 chỗ nhưng có thể có hàng chục nghìn khán giả cố mua cùng lúc. Hệ thống phải đảm bảo không có hai khán giả nào cùng nhận được chiếc vé cuối cùng.
2. **Tải trọng đột biến (High Traffic Peak):** Dự kiến khoảng 80.000 người truy cập trong 5 phút đầu, trong đó 70% dồn vào phút đầu tiên. Hệ thống cần có cơ chế bảo vệ backend API khỏi bị quá tải, ngăn chặn bot và client gửi request liên tục, đồng thời đảm bảo tính công bằng cho người dùng thật.
3. **Thanh toán không ổn định (Payment Gateway Instability):** Nếu cổng thanh toán (VNPAY/MoMo) gặp sự cố, khán giả vẫn phải xem được thông tin concert và danh sách vé còn lại bình thường. Luồng mua vé có phí cần xử lý tình huống thanh toán timeout mà không gây ra trừ tiền hai lần; các tính năng không liên quan đến thanh toán vẫn phải hoạt động bình thường khi cổng thanh toán gặp sự cố kéo dài.
4. **Soát vé offline:** Nhân sự ở khu vực sóng yếu trong sân vận động vẫn phải soát vé được cho khán giả; dữ liệu không được mất khi kết nối trở lại và **tuyệt đối không được** cho phép một vé vào cổng hai lần.
5. **Tích hợp một chiều (Data Ingestion):** Không thể gọi API hệ thống quản lý khách mời của nhãn hàng — chỉ có thể đọc CSV được gửi theo lịch cố định. Luồng nhập dữ liệu phải xử lý được file lỗi, dữ liệu trùng và không làm gián đoạn hệ thống đang chạy.
6. **Giới hạn vé per-user dưới tải cao:** Khi hàng chục nghìn người mua vé cùng lúc, cần đảm bảo giới hạn số vé mỗi tài khoản được áp dụng chính xác — không để một người mua vượt quá giới hạn dù gửi nhiều request đồng thời. Đây là bài toán tương tự tranh chấp chỗ ngồi nhưng ở phạm vi per-user thay vì toàn hệ thống.
7. **Quá tải trang chủ và trang chi tiết (Read-heavy):** Trang danh sách concert và trang chi tiết từng concert bị đọc với tần suất rất cao (hàng nghìn lần/giây trong giờ cao điểm) nhưng dữ liệu thay đổi không thường xuyên. Nếu mỗi request đều truy vấn thẳng vào database, hệ thống sẽ không chịu được tải. Cần có chiến lược cache hợp lý để giảm tải cho database mà vẫn đảm bảo dữ liệu đủ cập nhật (ví dụ: số vé còn lại phải phản ánh gần đúng thực tế).

---

## 5. Các nội dung cần thực hiện

### PHẦN 1 — BLUEPRINT (Tài liệu thiết kế)

#### 1. Tài liệu kiến trúc tổng thể

- Mô tả kiến trúc tổng thể, các thành phần chính, cách chúng giao tiếp và lý do lựa chọn.
- Trả lời được: Hệ thống gồm những phần nào? Giao tiếp ra sao? Khi một phần gặp sự cố thì các phần còn lại bị ảnh hưởng thế nào?

#### 2. Sơ đồ C4 (C4 Diagram)

- **Level 1 – System Context:** Thể hiện TicketBox trong bức tranh toàn cảnh (Actors & External Systems như VNPAY, MoMo, AI model, CSV).
- **Level 2 – Container:** Phân rã hệ thống thành các container (Web app, mobile app, backend API, database, message broker...), chỉ rõ công nghệ đề xuất và phương thức giao tiếp.

#### 3. High-Level Architecture Diagram

- Vẽ sơ đồ kiến trúc tổng quan thể hiện luồng dữ liệu và sự phụ thuộc giữa các thành phần, đặc biệt ở các điểm tích hợp (cổng thanh toán, AI model, hệ thống khách mời CSV) và luồng soát vé offline.

#### 4. Thiết kế cơ sở dữ liệu

- Xác định các loại dữ liệu chính, đề xuất loại database phù hợp (SQL, NoSQL, hoặc kết hợp) và giải thích lý do lựa chọn.
- Thiết kế schema cho các entity quan trọng nhất.

#### 5. Mô tả các luồng nghiệp vụ quan trọng

Mô tả chi tiết ít nhất hai trong số các luồng sau (gồm các bước xử lý, thành phần tham gia và cách xử lý lỗi giữa chừng):

- Luồng mua vé (từ khi bấm “Mua vé” đến khi nhận e-ticket).
- Luồng soát vé khi mất mạng và đồng bộ lại.
- Luồng nhập danh sách khách mời từ CSV.

#### 6. Thiết kế kiểm soát truy cập

- Thiết kế mô hình phân quyền (gợi ý: RBAC).
- Xác định các nhóm người dùng, quyền hạn và cách hệ thống kiểm tra quyền tại từng điểm truy cập (API endpoint, trang admin, mobile app soát vé).

#### 7. Thiết kế các cơ chế bảo vệ hệ thống

Trình bày giải pháp lựa chọn, nguyên lý hoạt động và lý do phù hợp cho các vấn đề:

- **Kiểm soát tải đột biến:** Làm thế nào để backend API không bị quá tải khi 80.000 người cùng truy cập mua vé trong phút đầu mở bán? (gợi ý: Rate Limiting — Fixed Window, Sliding Window, Token Bucket, Leaky Bucket)
- **Xử lý cổng thanh toán không ổn định:** Làm thế nào để hệ thống phản ứng khi VNPAY/MoMo liên tục lỗi mà không kéo sập toàn bộ dịch vụ? (gợi ý: Circuit Breaker với các trạng thái Closed / Open / Half-Open, kết hợp Graceful Degradation)
- **Chống trừ tiền hai lần:** Làm thế nào để đảm bảo một giao dịch mua vé chỉ được thực hiện đúng một lần dù khán giả bấm mua nhiều lần hoặc mạng bị ngắt giữa chừng? (gợi ý: Idempotency Key — cơ chế sinh key, nơi lưu trữ, cách kiểm tra trùng lặp, thời gian hết hạn)
- **Caching:** Làm thế nào để trang danh sách concert và trang chi tiết không làm quá tải database khi có hàng nghìn request/giây, trong khi vẫn phản ánh đúng số vé còn lại? (gợi ý: Cache-aside với Redis — xác định TTL phù hợp cho từng loại dữ liệu: thông tin concert ít thay đổi có thể cache lâu, số vé còn lại cần TTL ngắn hoặc invalidate chủ động khi có giao dịch thành công)

---

### PHẦN 2 — CÀI ĐẶT (Mã nguồn & Ứng dụng)

Phần mềm hoàn chỉnh, có thể chạy được, cài đặt toàn bộ hệ thống đã mô tả trong Blueprint. Phần cài đặt phải bao gồm:

- **Tính năng nghiệp vụ đầy đủ:** Tất cả các chức năng được mô tả trong phần Yêu cầu hệ thống — xem concert, mua vé, thông báo, quản trị, soát vé, AI Artist Bio, đồng bộ CSV khách mời.
- **Hiện thực hóa cơ chế kỹ thuật:** Toàn bộ giải pháp đã thiết kế trong Blueprint mục 6 và 7 phải được cài đặt thực sự trong code, **không chỉ sử dụng stub hoặc mô phỏng**.
- **Hướng dẫn khởi chạy:** `README` rõ ràng, đủ để người chấm có thể clone repository và chạy được hệ thống mà không cần hỏi thêm.
- **Dữ liệu mẫu (Seed Data):** Seed data hoặc script tạo dữ liệu ban đầu — bao gồm các concert mẫu (Anh Trai Say Hi, Anh Trai Vượt Ngàn Chông Gai, Em Xinh Say Hi, Chị Đẹp Đạp Gió Rẽ Sóng) với đầy đủ loại vé, giá và sơ đồ chỗ ngồi — để có thể thao tác và kiểm tra ngay sau khi khởi chạy.

---

## Cấu trúc thư mục bàn giao tham khảo (OpenSpec Framework)

Template tham khảo theo cấu trúc của OpenSpec — framework spec-driven development, gồm ba lớp tài liệu: proposal (vấn đề và lý do), design (giải pháp kỹ thuật), specs (kịch bản và ràng buộc cho từng tính năng). Nhóm có thể bổ sung mục hoặc điều chỉnh cấu trúc nếu phù hợp.

```text
blueprint/
├── proposal.md          # Bối cảnh, vấn đề, mục tiêu
├── design.md            # Kiến trúc, sơ đồ, quyết định kỹ thuật
└── specs/
    ├── auth.md          # Đặc tả phân quyền
    ├── payment.md       # Đặc tả luồng thanh toán và chống trừ tiền 2 lần
    ├── checkin.md       # Đặc tả luồng soát vé offline
    └── ...              # Đặc tả các tính năng khác
```

### proposal.md

```text
# TicketBox — Project Proposal

## Vấn đề
<!-- Mô tả vấn đề hiện tại mà hệ thống cần giải quyết.
     Tại sao các kênh bán vé hiện tại (Zalo OA, Google Form, chuyển khoản) không còn đủ?
     Hậu quả cụ thể: website sập, trừ tiền không ra vé, scalper bot vét hết vé. -->

## Mục tiêu
<!-- Hệ thống cần đạt được gì? Định lượng nếu có thể.
     Ví dụ: hỗ trợ 80.000 người truy cập trong 5 phút đầu mở bán mà không sập. -->

## Người dùng và nhu cầu
<!-- Ai dùng hệ thống? Họ cần làm gì? Điều gì quan trọng nhất với họ? -->

## Phạm vi
<!-- Những gì thuộc phạm vi đồ án này.
     Những gì KHÔNG thuộc phạm vi (ví dụ: tích hợp payment gateway thật, hạ tầng production). -->

## Rủi ro và ràng buộc
<!-- Các vấn đề kỹ thuật đã biết trước: tranh chấp vé, tải đột biến,
     cổng thanh toán không ổn định, soát vé offline, tích hợp một chiều CSV. -->
```

### design.md

```text
# TicketBox — Technical Design

## Kiến trúc tổng thể
<!-- Mô tả architectural style được chọn và lý do.
     Hệ thống gồm những thành phần nào? Chúng giao tiếp với nhau như thế nào? -->

## C4 Diagram

### Level 1 — System Context
<!-- Sơ đồ: TicketBox + actors + hệ thống ngoài (VNPAY, MoMo, AI model, CSV nhãn hàng) -->

### Level 2 — Container
<!-- Sơ đồ: web app, mobile app soát vé, backend API, database, message broker, ... -->

## High-Level Architecture Diagram
<!-- Sơ đồ luồng dữ liệu, đặc biệt tại các điểm tích hợp và luồng soát vé offline -->

## Thiết kế cơ sở dữ liệu
<!-- Loại database, lý do lựa chọn, schema các entity chính -->

## Thiết kế kiểm soát truy cập
<!-- Mô hình phân quyền, các nhóm người dùng, cách kiểm tra quyền tại từng điểm truy cập -->

## Thiết kế các cơ chế bảo vệ hệ thống

### Kiểm soát tải đột biến
<!-- Giải pháp, thuật toán, ngưỡng, hành vi khi vượt ngưỡng -->

### Xử lý cổng thanh toán không ổn định
<!-- Giải pháp, các trạng thái, ngưỡng kích hoạt, hành vi khi lỗi -->

### Chống trừ tiền hai lần
<!-- Cơ chế, nơi lưu trữ, TTL, luồng xử lý khi phát hiện trùng lặp -->

### Caching
<!-- Xác định các đối tượng cần cache (danh sách concert, chi tiết concert, số vé còn lại).
     Chiến lược: Cache-aside, Write-through hay Write-back?
     TTL cho từng loại. Cách invalidate khi dữ liệu thay đổi (đặc biệt: số vé sau mỗi giao dịch). -->

## Các quyết định kỹ thuật quan trọng (ADR)
<!-- Với mỗi quyết định lớn: lựa chọn gì, tại sao, đánh đổi gì.
     Ví dụ: SQL vs NoSQL, JWT vs Session, Kafka vs RabbitMQ, optimistic vs pessimistic locking, ... -->
```

### specs/[feature].md

```text
# Đặc tả: [Tên tính năng]

## Mô tả
<!-- Tính năng này làm gì? -->

## Luồng chính
<!-- Các bước xử lý theo thứ tự, các thành phần tham gia -->

## Kịch bản lỗi
<!-- Điều gì xảy ra khi: timeout, mất mạng, dữ liệu không hợp lệ, ... -->

## Ràng buộc
<!-- Giới hạn hiệu năng, bảo mật, tính nhất quán cần đảm bảo -->

## Tiêu chí chấp nhận
<!-- Làm thế nào để biết tính năng này hoạt động đúng? -->
```

---

## 7. Quy định nộp bài

### Định dạng file nộp

- **Định dạng:** Mỗi nhóm nộp một file text duy nhất lên hệ thống.
- **Tên file mẫu:** `mã-nhóm_mssv1_mssv2_mssv3_mssv4.txt` _(Ví dụ: N01_21127001_21127002_21127003_21127004.txt)_.
- **Nội dung file:** Link Google Drive public chứa tất cả các thành phần bài làm.
- **Yêu cầu video:** Quay màn hình trình bày giải pháp cho các vấn đề kỹ thuật và demo trực tiếp trên code/ứng dụng đang chạy (yêu cầu bật camera của thành viên thuyết trình).

### Cấu trúc thư mục trên Google Drive

Thư mục Drive của nhóm phải bao gồm đủ ba thành phần:

- **Blueprint** — Nhóm có thể nộp theo một trong hai hình thức
  - **PDF**: Một file blueprint.pdf duy nhất chứa đầy đủ các thành phần theo template.
  - **Markdown**: Thư mục blueprint/ tổ chức theo cấu trúc template, upload trực tiếp lên Drive.
- **Source code** — Thư mục src/ chứa toàn bộ mã nguồn, kèm thư mục data/ chứa seed data và script khởi tạo cơ sở dữ liệu, và file README.md với hướng dẫn cài đặt và khởi chạy.
- **Video trình bày** — Thư mục clips/ chứa video quay màn hình trình bày các vấn đề kỹ thuật mà nhóm đã giải quyết (không cần slide). Nội dung phải bao gồm camera thành viên thuyết trình và demo trực tiếp trên code hoặc ứng dụng đang chạy. Quy định kỹ thuật: độ phân giải FullHD (1080p), bitrate khoảng 720 kbps, định dạng MP4.
