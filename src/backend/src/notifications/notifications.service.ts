import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationPayload } from './channels/notification-channel.interface';
import { EmailChannel } from './channels/email.channel';
import { InAppChannel } from './channels/in-app.channel';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private channels: Map<string, NotificationChannel> = new Map();

  constructor(
    private readonly emailChannel: EmailChannel,
    private readonly inAppChannel: InAppChannel,
  ) {
    this.channels.set('EMAIL', this.emailChannel);
    this.channels.set('IN_APP', this.inAppChannel);
  }

  async send(channelName: string, payload: NotificationPayload): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      this.logger.warn(`Channel ${channelName} not found`);
      return;
    }
    await channel.send(payload);
  }
}
