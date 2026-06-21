# TicketBox System Architecture Design

> Stack: NestJS + Prisma + PostgreSQL + Redis · React (Vite) for web/scanner.

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

## 2. Database Design

PostgreSQL is the single source of truth. Prisma manages the schema and migrations
(`src/backend/prisma/schema.prisma`). All primary keys are UUIDs so IDs can be
generated client-side and never collide across services.

### Entity-Relationship Diagram

```mermaid
erDiagram
  User ||--o{ Order : places
  User ||--o{ Notification : receives
  User ||--o{ Ticket : "scans (checkedInBy)"
  Concert ||--o{ TicketType : has
  Concert ||--o{ Order : "sold via"
  Concert ||--o{ GuestListEntry : "guest list"
  Concert ||--o{ CsvImportBatch : "imports"
  TicketType ||--o{ OrderItem : "line item"
  TicketType ||--o{ Ticket : issues
  Order ||--o{ OrderItem : contains
  Order ||--o{ Ticket : issues
  Ticket ||--o{ CheckinLog : "scan attempts"

  User {
    string id PK
    string email UK
    string passwordHash
    Role role
    datetime createdAt
  }
  Concert {
    string id PK
    string slug UK
    string title
    string venue
    datetime startsAt
    ConcertStatus status
    string artistBio
    string seatMapSvg
  }
  TicketType {
    string id PK
    string concertId FK
    string name
    int price
    int totalQty
    int remainingQty
    int maxPerUser
    datetime saleStartsAt
  }
  Order {
    string id PK
    string userId FK
    string concertId FK
    OrderStatus status
    int totalAmount
    string idempotencyKey UK
    datetime expiresAt
  }
  OrderItem {
    string id PK
    string orderId FK
    string ticketTypeId FK
    int quantity
    int unitPrice
  }
  Ticket {
    string id PK
    string orderId FK
    string ticketTypeId FK
    string qrCode UK
    TicketStatus status
    datetime checkedInAt
    string checkedInBy FK
  }
  CheckinLog {
    string id PK
    string ticketId FK
    string deviceId
    datetime scannedAt
    SyncStatus syncStatus
  }
```

### Design decisions

- **Stock as a counter, not per-seat rows.** `TicketType.remainingQty` is decremented
  atomically on reservation. This keeps the high-contention purchase path to a single
  row update instead of inserting thousands of seat rows up front. The concurrency-safe
  decrement (`UPDATE ... WHERE remainingQty >= qty`) is the Week 2 graded mechanism — see
  [specs/purchase.md](specs/purchase.md).
- **`Order.expiresAt` lives on the order**, because the reservation (the `remainingQty`
  hold) is owned by the order, not the ticket type. A BullMQ sweeper (Person B) releases
  expired holds. See the reservation model in [specs/purchase.md](specs/purchase.md).
- **`Ticket.qrCode` is globally unique** so the scanner can resolve a ticket from the QR
  payload alone, offline-first.
- **`CheckinLog` is append-only** (every scan attempt is logged, including rejected
  duplicates) for the audit trail and the "2 devices offline" demo. The double check-in
  guard is enforced by a _partial_ unique index, not a plain unique — final choice is
  documented in [specs/checkin.md](specs/checkin.md) (Person C).
- **`GuestListEntry` dedup** uses `@@unique([concertId, docId, sourceBatchId])`. Because
  PostgreSQL treats NULLs as distinct, NULL-safe dedup for guests without a `docId` is
  handled in application code (Person B's CSV ingestion).
- **Indexes** back every foreign key used in hot reads (`TicketType.concertId`,
  `Order(userId, concertId)`, `OrderItem.orderId/ticketTypeId`, `CheckinLog.ticketId`).
- **Cascade deletes** flow Concert → TicketType / GuestListEntry / CsvImportBatch and
  Order/OrderItem so wiping a draft concert never strands child rows. `Ticket.checkedInBy`
  is `ON DELETE SET NULL` to preserve issued tickets if a scanner account is removed.

### Enums

`Role(AUDIENCE, ORGANIZER, SCANNER)`, `ConcertStatus(DRAFT, ON_SALE, CANCELLED)`,
`OrderStatus(PENDING, PAID, FAILED, EXPIRED)`, `TicketStatus(VALID, USED, CANCELLED)`,
`SyncStatus(PENDING, SYNCED, ACCEPTED, FAILED)`, `ImportStatus(PROCESSING, SUCCESS, FAILED)`,
`NotificationStatus(PENDING, SENT, FAILED)`, `GuestStatus(INVITED, CHECKED_IN)`.

---

## 3. Authentication & RBAC (Person A)

JWT bearer tokens, stateless. Passwords are bcrypt-hashed at rest. Three roles map to the
three apps: `AUDIENCE` → web browsing/purchase, `ORGANIZER` → admin, `SCANNER` → scanner app.

### Flow

```mermaid
sequenceDiagram
  participant C as Client
  participant Auth as AuthController/Service
  participant DB as PostgreSQL
  C->>Auth: POST /auth/login { email, password }
  Auth->>DB: findUnique(email)
  DB-->>Auth: user { passwordHash, role }
  Auth->>Auth: bcrypt.compare(password, hash)
  Auth-->>C: { access_token } (JWT signed with { sub, email, role })
  Note over C,Auth: subsequent requests
  C->>Auth: GET /protected (Authorization: Bearer <jwt>)
  Auth->>Auth: JwtStrategy.validate → req.user { userId, email, role }
  Auth->>Auth: RolesGuard checks @Roles() vs user.role
  Auth-->>C: 200 if role allowed, else 403
```

### Components

- **AuthService** — `register()` bcrypt-hashes the password and stores the user;
  `login()` verifies the password and signs a JWT with payload `{ sub, email, role }`.
- **JwtStrategy** — extracts the bearer token, verifies signature/expiry against
  `JWT_SECRET`, attaches `{ userId, email, role }` to the request.
- **`@Roles(...)` decorator + RolesGuard** — declarative endpoint protection. `RolesGuard`
  reads the `roles` metadata via `Reflector`; absence of metadata means the route is open
  to any authenticated user. `JwtAuthGuard` (Passport `'jwt'`) runs first to populate
  `req.user`.

Full behaviour, error cases, and acceptance criteria: [specs/auth.md](specs/auth.md).

---

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