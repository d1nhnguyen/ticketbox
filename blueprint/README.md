# TicketBox Blueprint — Mục lục và truy vết tiêu chí

Blueprint được tổ chức theo ba lớp:

- [proposal.md](proposal.md): vấn đề, mục tiêu, phạm vi, rủi ro và luận điểm kiến trúc.
- [design.md](design.md): C4, kiến trúc runtime, dữ liệu, failure boundary, ADR và các cơ chế bảo vệ.
- `specs/`: luồng chi tiết, error scenarios, ràng buộc và acceptance criteria theo feature.

## Ma trận truy vết Blueprint

| Tiêu chí | Bằng chứng chính | Ghi chú phạm vi/bảo đảm |
|---|---|---|
| Kiến trúc tổng thể, thành phần, giao tiếp, ảnh hưởng khi lỗi và lý do chọn | [design — mục 0, kiến trúc tổng thể, cô lập lỗi và ADR](design.md) | Modular monolith được so sánh với layered monolith, microservices và serverless |
| C4 Level 1 — actors và hệ thống ngoài | [design — C4 cấp 1](design.md) | Khán giả, BTC, scanner, VNPAY/MoMo, AI, SMTP và CSV |
| C4 Level 2 — containers, công nghệ và giao tiếp | [design — C4 cấp 2](design.md) | React/Vite, Scanner PWA, NestJS/BullMQ/Prisma, PostgreSQL, Redis, gateway, SMTP và filesystem |
| High-Level Architecture Diagram | [design — luồng runtime](design.md) | Payment, AI, SMTP, CSV, offline queue và failure boundary |
| SQL/NoSQL, ERD và consistency | [design — thiết kế cơ sở dữ liệu](design.md) | PostgreSQL là system of record; Redis không giữ ledger chuẩn |
| Mua vé đến e-ticket và lỗi giữa chừng | [specs/purchase.md](specs/purchase.md), [specs/payment.md](specs/payment.md) | Sequence end-to-end; transaction, expiry, gateway failure, phát QR và notification |
| Check-in offline, sync và conflict | [specs/checkin.md](specs/checkin.md) | Sequence + conditional update + append-only audit; công khai giới hạn hai thiết bị bị partition |
| Guest List CSV | [specs/csv-ingestion.md](specs/csv-ingestion.md) | Flow validation, SHA-256 idempotency, row isolation, retry và processed/failed |
| RBAC và enforcement | [specs/auth.md](specs/auth.md), [specs/admin.md](specs/admin.md) | Role-permission matrix; API là security boundary, UI/PWA là defense in depth |
| Tải đột biến/rate limiting | [design — ADR 7 và mục 6.2](design.md) | Phép tính 933 user/s; token bucket, threshold, key, `429`/`Retry-After`; chưa tuyên bố waiting-room hoàn chỉnh |
| Circuit Breaker và graceful degradation | [design — ADR 11](design.md), [specs/payment.md](specs/payment.md) | Closed/Open/Half-Open, timeout 5 giây, 50%, volume 5, reset 10 giây và fallback `503` |
| Idempotency chống tác dụng phụ lặp | [design — ADR 12](design.md), [specs/purchase.md](specs/purchase.md) | Sinh/reuse UUID, Redis TTL 24 giờ, unique DB, response lặp và giới hạn request hash |
| Cache-aside và inventory freshness | [design — mục 6.5](design.md), [specs/admin.md](specs/admin.md) | TTL/invalidation table; DB transaction luôn quyết định cấp vé; ghi rõ các write path còn thiếu invalidation |
| ADR và trade-off | [design — mục 5](design.md) | 12 ADR có phương án, lý do, hệ quả, giảm thiểu và điều kiện xem xét lại |
| Specs có acceptance/error scenarios | [specs/](specs/) | Auth, admin, purchase, payment, check-in, CSV, notification và AI bio |

## Giới hạn không được hiểu sai

1. Con số rate limit hiện tại là cấu hình có thể kiểm thử, không phải chứng nhận production chịu mọi traffic 80.000 người; production cần load test và admission/waiting room.
2. Server chỉ chấp nhận một check-in chính thức cho mỗi vé. Hai scanner hoàn toàn offline có thể cùng tạm chấp nhận trước khi sync; bảo đảm vật lý nghiêm ngặt cần gate partition hoặc edge server LAN.
3. Notification dùng in-process event trước BullMQ; transactional outbox là bước nâng cấp nếu yêu cầu không mất event giữa DB commit và enqueue.
4. Cache detail hiện gộp metadata và inventory; direct update loại vé và release-expired chưa invalidate đầy đủ nên dữ liệu public có thể cũ tối đa TTL.
