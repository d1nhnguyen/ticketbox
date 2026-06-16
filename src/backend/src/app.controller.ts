import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { SkipRateLimit } from './common/decorators/rate-limit.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @SkipRateLimit()
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @SkipRateLimit()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
