import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RateLimitConfig } from 'src/common/decorators/rate-limit.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Stricter limit on register: 10 burst, 1 token/s refill → anti-spam
  @RateLimitConfig({ capacity: 10, refillRate: 1, keyStrategy: 'ip' })
  @Post('register')
  async register(@Body() body: any) {
    return this.authService.register(body);
  }

  // Stricter limit on login: 5 burst, 0.5 token/s → brute-force protection
  @RateLimitConfig({ capacity: 5, refillRate: 0.5, keyStrategy: 'ip' })
  @Post('login')
  async login(@Body() body: any) {
    return this.authService.login(body);
  }
}
