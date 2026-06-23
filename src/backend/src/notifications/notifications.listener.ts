import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(@InjectQueue('notifications') private notificationsQueue: Queue) {}

  @OnEvent('order.paid')
  async handleOrderPaidEvent(order: any) {
    this.logger.log(`Handling order.paid event for order ${order.id}`);

    // Enqueue email notification
    await this.notificationsQueue.add('notification.send', {
      channel: 'EMAIL',
      payload: {
        userId: order.userId,
        type: 'ORDER_PAID',
        data: { orderId: order.id, totalAmount: order.totalAmount },
      },
    });

    // Enqueue in-app notification
    await this.notificationsQueue.add('notification.send', {
      channel: 'IN_APP',
      payload: {
        userId: order.userId,
        type: 'ORDER_PAID',
        data: { orderId: order.id, totalAmount: order.totalAmount },
      },
    });
  }
}
