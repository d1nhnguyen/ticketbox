import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  CONCERT_CANCELLED_EVENT,
  ConcertCancelledEvent,
} from '../concerts/events/concert-cancelled.event';

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(@InjectQueue('notifications') private notificationsQueue: Queue) { }

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

  /**
   * Khi admin hủy concert, gửi thông báo cho tất cả người mua (PAID orders).
   * ConcertsService.cancel() emit sự kiện này kèm danh sách buyerUserIds.
   */
  @OnEvent(CONCERT_CANCELLED_EVENT)
  async handleConcertCancelledEvent(event: ConcertCancelledEvent) {
    this.logger.log(
      `Handling concert.cancelled event for concert "${event.title}" — notifying ${event.buyerUserIds.length} buyer(s)`,
    );

    for (const userId of event.buyerUserIds) {
      // Enqueue EMAIL notification cho từng người mua
      await this.notificationsQueue.add('notification.send', {
        channel: 'EMAIL',
        payload: {
          userId,
          type: 'CONCERT_CANCELLED',
          data: {
            concertId: event.concertId,
            concertTitle: event.title,
            message: `Rất tiếc, sự kiện "${event.title}" đã bị hủy. Vé của bạn sẽ được hoàn tiền trong thời gian sớm nhất.`,
          },
        },
      });

      // Enqueue IN_APP notification cho từng người mua
      await this.notificationsQueue.add('notification.send', {
        channel: 'IN_APP',
        payload: {
          userId,
          type: 'CONCERT_CANCELLED',
          data: {
            concertId: event.concertId,
            concertTitle: event.title,
            message: `Sự kiện "${event.title}" đã bị hủy. Vé của bạn sẽ được hoàn tiền.`,
          },
        },
      });
    }

    this.logger.log(
      `[concert.cancelled] Queued ${event.buyerUserIds.length * 2} notification jobs (EMAIL + IN_APP each)`,
    );
  }
}
