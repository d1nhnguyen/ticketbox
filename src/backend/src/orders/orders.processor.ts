import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { OrdersService } from './orders.service';

@Processor('orders')
export class OrdersProcessor extends WorkerHost {
  private readonly logger = new Logger(OrdersProcessor.name);

  constructor(private readonly ordersService: OrdersService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    if (job.name === 'release-expired') {
      const released = await this.ordersService.releaseExpiredOrders();
      if (released > 0) {
        this.logger.log(`Released ${released} expired orders`);
      }
      return released;
    }
  }
}
