# Notifications Spec

## Description
System for dispatching email and in-app notifications asynchronously using BullMQ. Includes an automated 24-h cron job to send reminders.

## Main Flow
1. Purchase success triggers a `notification.send` BullMQ job.
2. Worker consumes job, resolves Strategy (Email/In-App).
3. Executes notification sending.

## Error Scenarios
- **Worker crash**: Job is retried by BullMQ.
- **Provider API error**: Fails job gracefully, retries with exponential backoff.

## Constraints
- Configured using Strategy Pattern for clean channel expansion.
- Notification table retains history/status.

## Acceptance Criteria
- Purchase places a notification job on queue.
- User sees `IN_APP` notification after payment success.
- Cron correctly sweeps and creates reminder notifications for concerts starting in 24h.
