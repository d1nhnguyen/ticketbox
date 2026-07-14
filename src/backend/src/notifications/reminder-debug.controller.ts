import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { DemoEnabledGuard } from 'src/common/guards/demo-enabled.guard';

/**
 * Endpoint debug-only để trigger cron thủ công trong quá trình test.
 * Không nên expose trong môi trường production.
 */
@Controller('debug/reminders')
@UseGuards(DemoEnabledGuard)
export class ReminderDebugController {
  constructor(private readonly reminderService: ReminderService) {}

  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  async triggerNow() {
    await this.reminderService.sendReminders();
    return { triggered: true, at: new Date().toISOString() };
  }
}
