# Đặc tả soát vé ngoại tuyến và chống quét trùng

## Mô tả

Scanner PWA cho phép nhân viên chọn concert, tải trước snapshot vé hợp lệ và khách VIP vào IndexedDB, sau đó quét khi mất mạng. Hàng đợi cục bộ được đồng bộ mỗi 10 giây và ngay khi trình duyệt phát sự kiện `online`.

Chống quét trùng có hai lớp:

1. **Trên thiết bị:** IndexedDB phát hiện QR đã có trong `scanQueue`, từ chối ngay mà không gọi server.
2. **Trên server:** transaction thực hiện conditional update `Ticket.status: VALID → USED`; chỉ request đầu tiên đổi được một dòng.

## Quyết định kỹ thuật

### Phương án được chọn

- Guard thực sự là `ticket.updateMany({ where: { id, status: VALID } })` trong transaction.
- `CheckinLog` là nhật ký append-only; mọi lần đồng bộ, kể cả duplicate bị từ chối, đều được ghi để audit.
- `clientLogId` do client tạo và là khóa chính của log, nên gửi lại cùng record trả `ALREADY_SYNCED`.
- Migration tạo partial unique index `one_checkin_per_ticket` trên `Ticket(id) WHERE status='USED'`. Vì `Ticket.id` vốn đã là khóa chính, index này không bổ sung tính duy nhất thực tế; tính đúng đắn phụ thuộc vào conditional update. Index được giữ để tương thích với migration/tiêu chí bài tập.

Không chọn unique `CheckinLog.ticketId`, vì cách đó sẽ ngăn lưu các lần thử trùng và làm mất audit trail của kịch bản hai thiết bị offline.

## Luồng chính

### 1. Tải snapshot khi có mạng

1. Scanner đăng nhập và chọn concert.
2. PWA gọi song song `GET /concerts/:id/tickets/valid` và `GET /concerts/:id/guests` bằng JWT `SCANNER`.
3. Snapshot được thay thế trong một transaction Dexie, chỉ cho concert đã chọn; các queue pending được giữ nguyên.

### 2. Quét vé offline

1. PWA tra `qrCode` trong `validTickets`; không có thì báo `INVALID`.
2. Nếu đã có record cùng `ticketId` trong `scanQueue`, báo đã quét trên thiết bị.
3. Nếu hợp lệ, PWA tạo UUID `clientLogId`, lưu `{ clientLogId, ticketId, deviceId, scannedAt, syncStatus: PENDING }` và chấp nhận cục bộ.

### 3. Đồng bộ vé

```http
POST /checkin/sync
Authorization: Bearer <SCANNER_JWT>
Content-Type: application/json

{
  "scans": [{
    "clientLogId": "uuid-client",
    "ticketId": "uuid-ticket",
    "deviceId": "gate-device-01",
    "scannedAt": "2026-07-14T10:00:00.000Z"
  }]
}
```

Backend xử lý từng scan trong transaction riêng, đổi trạng thái vé có điều kiện rồi ghi `CheckinLog` là `ACCEPTED` hoặc `FAILED`. Client đổi record thành `SYNCED` khi nhận `ACCEPTED`/`ALREADY_SYNCED`; nhận `DUPLICATE` thì đổi `FAILED` và phát sự kiện cảnh báo xung đột.

### 4. Khách mời VIP

- Snapshot lưu khách vào bảng `guests`; check-in offline ghi `guestCheckinQueue` theo khóa `guestId` và cập nhật trạng thái cục bộ.
- Khi có mạng, PWA gọi `POST /guests/check-in`; server conditional update `INVITED → CHECKED_IN`.
- Nếu khách đã check-in ở nơi khác, client đánh dấu `ALREADY_CHECKED_IN` nhưng coi record đã đồng bộ xong.

## Kịch bản lỗi

| Tình huống | Hành vi |
|---|---|
| Mất mạng khi quét | Lưu `PENDING`, chấp nhận cục bộ và thử lại khi online |
| Cùng vé quét lần hai trên một thiết bị | IndexedDB chặn ngay |
| Cùng vé quét trên hai thiết bị đều offline | Cả hai tạm chấp nhận; thiết bị sync trước nhận `ACCEPTED`, thiết bị sau nhận `DUPLICATE` |
| Gửi lại cùng `clientLogId` | Vi phạm khóa chính được chuyển thành `ALREADY_SYNCED` |
| QR không có trong snapshot | Từ chối cục bộ, không gửi server |
| Batch sai DTO và server trả 400 | Client đánh dấu các record batch `FAILED` để không retry vô hạn |
| Lỗi mạng/5xx | Giữ `PENDING` cho chu kỳ sau |

### Giới hạn đã biết

Hai thiết bị không liên lạc khi cùng offline không thể ngăn cùng quét một vé theo thời gian thực. Xung đột chỉ được phát hiện khi đồng bộ; đây là giới hạn tự nhiên của thiết kế offline-first.

Điều này tạo khác biệt quan trọng giữa hai mức bảo đảm:

- **Code hiện bảo đảm:** PostgreSQL chỉ chấp nhận một transition `VALID → USED`; audit giữ cả lần thắng và lần xung đột. Một vé chỉ có một check-in chính thức.
- **Code hiện chưa bảo đảm:** hai scanner bị partition có thể cùng hiển thị “hợp lệ” và cho người qua trước khi sync. Vì vậy chưa thể tuyên bố tuyệt đối không có hai lượt vào cổng ở lớp vật lý.

Để đạt bảo đảm vật lý nghiêm ngặt mà vẫn offline, deployment phải bổ sung ít nhất một cơ chế: chia ticket thành gate shard và mỗi gate chỉ chấp nhận shard của mình; edge server/LAN chia sẻ trạng thái giữa scanner; hoặc chỉ định một scanner offline có quyền trên mỗi partition. Gate partition làm giảm tính linh hoạt đổi cổng; edge server tăng hạ tầng tại sự kiện. Phạm vi hiện tại chọn availability và audit/reconcile, đồng thời công khai đánh đổi này.

## Ràng buộc

- `DEVICE_ID` phải được lưu bền vững trên thiết bị để phục vụ audit.
- Endpoint snapshot và sync chỉ dành cho `SCANNER`.
- Mỗi scan xử lý trong transaction riêng để một record lỗi không rollback cả batch.
- `CheckinLog.ticketId` chỉ có index thường, không có unique.
- Hiện lỗi server không mong đợi trong một scan bị quy về `DUPLICATE`; nên tăng khả năng quan sát trước khi dùng production.

## Tiêu chí chấp nhận

- Migration và seed chạy được trên DB sạch; schema không drift.
- Scan hợp lệ → `ACCEPTED`, vé thành `USED`, log thành `ACCEPTED`.
- Gửi lại `clientLogId` → `ALREADY_SYNCED`, không tạo log mới.
- Scan vé đã `USED` → `DUPLICATE` và vẫn ghi log `FAILED`.
- Kịch bản hai thiết bị tạo đúng hai log: một `ACCEPTED`, một `FAILED`; UI thiết bị sau hiển thị conflict.
- Snapshot và hàng đợi VIP không làm mất record vé/khách đang chờ đồng bộ.
