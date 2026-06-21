# TicketBox System Architecture Design

## 1. C4 Model - Level 1: System Context Diagram
Sơ đồ này thể hiện hệ thống TicketBox tương tác với các nhóm người dùng và các hệ thống bên ngoài.

```mermaid
%%{init: {"c4": {"c4ShapeMargin": 90, "c4ShapePadding": 20, "diagramMarginX": 30, "diagramMarginY": 20}}}%%
C4Context
title System Context Diagram - TicketBox

Person(audience, "Khán giả", "Tìm kiếm sự kiện, mua vé,<br/>nhận mã QR vé điện tử")
Person(organizer, "Ban tổ chức", "Tạo sự kiện, cấu hình hạng vé,<br/>xem thống kê doanh thu")
Person(scanner, "Nhân viên soát vé", "Quét QR code tại cổng sự kiện<br/>(hỗ trợ offline)")


System_Ext(payment, "Cổng thanh toán (VNPAY/MoMo)", "Hệ thống xử lý<br/>giao dịch tài chính")
System(ticketbox, "TicketBox System", "Hệ thống cốt lõi quản lý sự kiện,<br/>bán vé và soát vé")
System_Ext(ai_model, "AI Model", "Xử lý file PDF để tự động<br/>tạo tiểu sử nghệ sĩ")
System_Ext(brand_csv, "Hệ thống Nhãn hàng", "Cung cấp danh sách khách mời<br/>dạng CSV")

Rel(audience, ticketbox, "Xem sự kiện, đặt mua vé")
Rel(organizer, ticketbox, "Quản lý hệ thống, xem báo cáo")
Rel(scanner, ticketbox, "Soát vé khán giả tại cổng")

Rel(ticketbox, payment, "Gửi yêu cầu và nhận<br/>kết quả thanh toán")
Rel(ticketbox, ai_model, "Gửi nội dung PDF,<br/>nhận đoạn văn tiểu sử")
Rel(ticketbox, brand_csv, "Định kỳ tải file<br/>danh sách khách mời")

UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

### 1.1. C4 Model - Level 2: Container Diagram

```mermaid
%%{init: {"c4": {"c4ShapeMargin": 90, "c4ShapePadding": 20, "diagramMarginX": 30, "diagramMarginY": 20}}}%%
C4Container
title Container Diagram - TicketBox

Person(audience, "Khán giả", "Mua vé")
Person(organizer, "Ban tổ chức", "Quản lý")
Person(scanner, "Soát vé", "Quét QR")

System_Boundary(ticketbox, "TicketBox System") {
    Container(web_app, "Web Application", "React, Vite, Tailwind", "Giao diện chính cho<br/>Khán giả và Ban tổ chức")

    Container(api, "Backend API", "NestJS, Node.js", "Xử lý logic nghiệp vụ,<br/>giao tiếp với DB và Queue")
    Container(pwa_scanner, "Scanner PWA", "React, IndexedDB, Service Worker", "Ứng dụng quét vé<br/>Offline-first tại cổng")
    Container(mock_gateway, "Mock Payment Gateway", "Express.js", "Giả lập phản hồi<br/>từ VNPAY/MoMo")
    Container(worker, "Background Worker", "BullMQ, Node.js", "Xử lý tác vụ nền: Gửi thông báo,<br/>hết hạn giữ chỗ")

    ContainerDb(db, "Primary Database", "PostgreSQL", "Lưu trữ User, Concert,<br/>Order, Ticket")
    ContainerDb(redis, "Cache & Message Broker", "Redis", "Rate limit, khóa Idempotency,<br/>hàng đợi BullMQ")
}

Rel(audience, web_app, "Truy cập ứng dụng", "HTTPS")
Rel(organizer, web_app, "Truy cập ứng dụng", "HTTPS")
Rel(scanner, pwa_scanner, "Sử dụng ứng dụng", "HTTPS")

Rel(web_app, api, "Gọi API", "JSON/HTTPS")
Rel(pwa_scanner, api, "Đồng bộ dữ liệu check-in", "JSON/HTTPS")

Rel(api, mock_gateway, "Yêu cầu thanh toán", "HTTPS")
Rel(api, db, "Đọc/Ghi dữ liệu", "Prisma/TCP")
Rel(api, redis, "Đọc/Ghi Cache & Đẩy Job", "TCP")
Rel(worker, redis, "Lấy Job từ hàng đợi", "TCP")
Rel(worker, db, "Cập nhật trạng thái", "Prisma/TCP")

UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

### 1.2. Request Flow Diagram (Runtime View)

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 60, 'rankSpacing': 90, 'curve': 'basis'}}}%%
graph TD
    subgraph ClientTier["Client Tier"]
        W[Web App - React]
        P[PWA Scanner - React]
        IDB[(IndexedDB Local)]
    end

    subgraph APITier["API Tier"]
        API[NestJS API Core]
        CB((Circuit Breaker))
    end

    subgraph DataQueueTier["Data and Queue Tier"]
        PG[(PostgreSQL)]
        RD[(Redis)]
        WQ[BullMQ Worker]
    end

    W -->|"1. Đặt mua vé"| API
    P -->|"2. Quét QR Offline"| IDB
    P -->|"3. Gửi Batch Sync"| API

    API -->|"4. Kiểm tra, khóa vé"| PG
    API -->|"Rate Limit / Cache"| RD
    API -->|"5. Đẩy job"| WQ

    WQ -->|"6. Lấy job"| RD
    WQ -->|"7. Cập nhật KQ"| PG

    API --> CB
    CB -->|"Giao dịch"| MockGateway[Mock Payment Gateway]
```

## Mechanisms (Person B)

### 2. Rate Limiting

- **Implementation**: Token Bucket pattern via Redis.
- **Why**: Protect against traffic spikes (e.g. 80k requests/5m).
- **ADR**: We chose Redis Token Bucket over memory caching to support horizontal scaling later, and to apply accurate rate limiting per IP/user identifier globally.

### 3. Circuit Breaker

- **Implementation**: Mock gateway wrapped by a Circuit Breaker middleware.
- **Why**: Handles payment gateway failure gracefully without blocking concert listing.
- **ADR**: Selected `opossum` for Node.js circuit breaker. We could have used native try-catch logic but `opossum` implements a robust Open/Half-Open/Closed state machine.

### 7. Caching

- **Implementation**: Cache-aside with Redis.
- **Why**: DB load reduction for highly concurrent read endpoints (e.g., concert list and detail).
- **ADR**: Selected Cache-aside over Read-through because of NestJS + Prisma constraints, and because we only need to cache hot data with a relatively short TTL. Explicit invalidation is done upon ticket purchase.

### 4. Idempotency (For Payment)

- **Implementation**: Idempotency-Key header cached in Redis.
- **Why**: Prevents double-charging if the user or app retries the same payment transaction.
- **ADR**: Redis TTL-based idempotency was preferred to a pure relational model check due to the speed and efficiency of checking Redis before hitting the payment logic or database.