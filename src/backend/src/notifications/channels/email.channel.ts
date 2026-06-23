import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationPayload } from './notification-channel.interface';

@Injectable()
export class EmailChannel implements NotificationChannel {
  private readonly logger = new Logger(EmailChannel.name);

  async send(payload: NotificationPayload): Promise<void> {
    // In a real app, integrate with SendGrid, SES, etc.
    this.logger.log(`[EmailChannel] Sending email to user ${payload.userId}. Type: ${payload.type}. Data: ${JSON.stringify(payload.data)}`);
  }
}
