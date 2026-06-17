import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { RateLimitService } from '../redis/rate-limit.service';

/**
 * Metadata key to skip rate limiting on specific endpoints.
 * Usage: @SkipRateLimit() on controller or handler.
 */
export const SKIP_RATE_LIMIT_KEY = 'skipRateLimit';

/**
 * Metadata key to apply a custom rate limit config on specific endpoints.
 * Usage: @RateLimitConfig({ capacity: 5, refillRate: 1 })
 */
export const RATE_LIMIT_CONFIG_KEY = 'rateLimitConfig';

export interface RateLimitOptions {
  /** Max tokens (burst capacity) */
  capacity?: number;
  /** Tokens refilled per second. */
  refillRate?: number;
  /** Tokens consumed per request. Default: 1 */
  cost?: number;
  /** Key strategy: 'ip' | 'user' | 'ip+user'. Default: 'ip' */
  keyStrategy?: 'ip' | 'user' | 'ip+user';
  /**
   * Example: paymentCapacity: 'PAYMENT_RATE_LIMIT_CAPACITY'
   * Ignored if `capacity` is also set.
   */
  paymentCapacity?: string;
  /**
   * Example: paymentRefillRate: 'PAYMENT_RATE_LIMIT_REFILL_RATE'
   * Ignored if `refillRate` is also set.
   */
  paymentRefillRate?: string;
}

/**
 * Global Token Bucket Rate Limit Guard.
 *
 * Default limits (overridable per-route via @RateLimitConfig):
 *   - 100 tokens capacity (burst)
 *   - 10 tokens/second refill  →  600 req/min sustained
 *
 * Exceeding the limit returns HTTP 429 with Retry-After header.
 *
 * Identity strategy:
 *   - Anonymous requests: keyed by IP address
 *   - Authenticated requests: keyed by user ID (fairer, prevents shared-IP issues)
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly defaultCapacity: number;
  private readonly defaultRefillRate: number;

  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {
    // Environment-configurable defaults
    this.defaultCapacity = parseInt(
      configService.get<string>('RATE_LIMIT_CAPACITY', '100'),
      10,
    );
    this.defaultRefillRate = parseFloat(
      configService.get<string>('RATE_LIMIT_REFILL_RATE', '10'),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check @SkipRateLimit() decorator
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    // Check per-route override
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_CONFIG_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Resolve capacity: hardcoded > env var > global default
    const capacity =
      options?.capacity ??
      (options?.paymentCapacity
        ? parseInt(this.configService.get<string>(options.paymentCapacity, String(this.defaultCapacity)), 10)
        : this.defaultCapacity);

    // Resolve refillRate: hardcoded > env var > global default
    const refillRate =
      options?.refillRate ??
      (options?.paymentRefillRate
        ? parseFloat(this.configService.get<string>(options.paymentRefillRate, String(this.defaultRefillRate)))
        : this.defaultRefillRate);

    const cost = options?.cost ?? 1;
    const keyStrategy = options?.keyStrategy ?? 'ip';

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const bucketKey = this.buildKey(req, keyStrategy);

    const { allowed, remaining, retryAfterMs } =
      await this.rateLimitService.consume(bucketKey, capacity, refillRate, cost);

    // Set standard rate limit headers (RateLimit-* draft RFC)
    res.setHeader('X-RateLimit-Limit', capacity);
    res.setHeader('X-RateLimit-Remaining', remaining);

    if (!allowed) {
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      res.setHeader('X-RateLimit-Reset', Date.now() + retryAfterMs);

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Please retry after ${retryAfterSec} second(s).`,
          retryAfterMs,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private buildKey(req: Request, strategy: string): string {
    const ip = this.getClientIp(req);
    const userId = (req as any).user?.sub ?? (req as any).user?.id;

    switch (strategy) {
      case 'user':
        return userId ? `rl:user:${userId}` : `rl:ip:${ip}`;
      case 'ip+user':
        return userId ? `rl:ip+user:${ip}:${userId}` : `rl:ip:${ip}`;
      default:
        return `rl:ip:${ip}`;
    }
  }

  private getClientIp(req: Request): string {
    // Respect X-Forwarded-For when behind a proxy/nginx
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return (Array.isArray(forwarded) ? forwarded[0] : forwarded)
        .split(',')[0]
        .trim();
    }
    return req.ip ?? 'unknown';
  }
}
