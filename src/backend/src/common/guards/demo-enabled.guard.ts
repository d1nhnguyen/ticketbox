import { Injectable, CanActivate, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DemoEnabledGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(): boolean {
    const enabled = this.configService.get<string | boolean>(
      'ENABLE_DEMO_ENDPOINTS',
      false,
    );
    const isEnabled = enabled === true || enabled === 'true';
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    if (!isEnabled || nodeEnv === 'production') {
      throw new NotFoundException();
    }

    return true;
  }
}
