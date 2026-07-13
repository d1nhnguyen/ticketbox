# Notifications Spec

## 1. Description
System for dispatching email and in-app notifications asynchronously using BullMQ. Includes an automated 24-h cron job to send reminders. The notification system uses the Strategy pattern to easily extend channels in the future (e.g., Zalo, SMS).

## 2. Main Flow
1. **Event Trigger**: Domain events (e.g., `order.paid`, `concert.cancelled`) are intercepted by `NotificationsListener`.
2. **Job Enqueue**: The listener enqueues `notification.send` jobs into BullMQ for the required channels (e.g., `EMAIL`, `IN_APP`).
3. **Processing**: `NotificationsProcessor` consumes the job and uses `NotificationChannelFactory` to get the correct Strategy implementation.
4. **Delivery**: 
   - `InAppChannel`: Saves the notification payload to PostgreSQL.
   - `EmailChannel`: Renders HTML templates (based on `payload.type`) and sends real emails via Nodemailer/SMTP.
5. **Reminder Cron**: `@Cron('*/15 * * * *')` runs every 15 minutes to find concerts starting in exactly 24 hours. It enqueues reminder notifications for all `PAID` users.

## 3. Error Scenarios
- **Worker Crash**: If the server restarts or crashes during email sending, BullMQ will retry the job.
- **Provider API Error (e.g., SMTP down)**: The job throws an error, causing BullMQ to mark it as `FAILED` and retry with exponential backoff (up to configured limits).
- **Unknown Event Type**: Falls back to a generic notification template.

## 4. Constraints
- **Asynchronous Execution**: Notifications must not block the HTTP request/response cycle.
- **Extensibility**: Adding a new channel must only require adding a new class implementing `NotificationChannel` and registering it in the factory.
- **Idempotency (Cron)**: The reminder cron must not send duplicates to the same user for the same concert. Checked via `Notification` table records or BullMQ `jobId` hashing.

## 5. Acceptance Criteria
- A successful purchase creates an `IN_APP` notification visible in the Audience Dashboard.
- A successful purchase sends an email with the subject "Xác nhận đặt vé TicketBox thành công!".
- Cancelling a concert sends an email notifying all `PAID` buyers.
- The cron correctly sweeps and creates reminder notifications for concerts exactly 24 hours away.
