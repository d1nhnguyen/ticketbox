import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.module';

/**
 * Token Bucket Rate Limiting Service (Redis-backed)
 *
 * Algorithm:
 *   - Each identity (IP or user ID) has a "bucket" with a max capacity of tokens.
 *   - Tokens refill at a constant rate (tokensPerInterval tokens every intervalMs ms).
 *   - Each request consumes 1 token. If the bucket is empty → reject with HTTP 429.
 *
 * All state is stored atomically in Redis via a Lua script to avoid race conditions.
 */
@Injectable()
export class RateLimitService {
  /**
   * Lua script for atomic token bucket check-and-consume.
   * Returns: [allowed (1|0), remainingTokens, retryAfterMs]
   */
  private readonly LUA_SCRIPT = `
    local key        = KEYS[1]
    local capacity   = tonumber(ARGV[1])
    local refillRate = tonumber(ARGV[2])   -- tokens per second
    local nowMs      = tonumber(ARGV[3])   -- current time in ms
    local cost       = tonumber(ARGV[4])   -- tokens to consume (usually 1)

    local bucket = redis.call("HMGET", key, "tokens", "lastRefillMs")
    local tokens       = tonumber(bucket[1])
    local lastRefillMs = tonumber(bucket[2])

    -- First visit: initialise bucket
    if tokens == nil then
      tokens       = capacity
      lastRefillMs = nowMs
    end

    -- Calculate how many tokens have refilled since last check
    local elapsedMs    = math.max(0, nowMs - lastRefillMs)
    local refilled     = math.floor(elapsedMs * refillRate / 1000)
    tokens             = math.min(capacity, tokens + refilled)
    lastRefillMs       = nowMs

    local allowed = 0
    local retryAfterMs = 0

    if tokens >= cost then
      tokens  = tokens - cost
      allowed = 1
    else
      -- How long until we have 1 token again
      retryAfterMs = math.ceil((cost - tokens) / refillRate * 1000)
    end

    redis.call("HSET", key, "tokens", tokens, "lastRefillMs", lastRefillMs)
    -- TTL: expire bucket after capacity/refillRate seconds of inactivity × 2
    redis.call("PEXPIRE", key, math.ceil(capacity / refillRate * 2000))

    return { allowed, tokens, retryAfterMs }
  `;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Attempt to consume `cost` tokens from the bucket identified by `key`.
   *
   * @param key        Redis key (e.g. "rl:ip:192.168.1.1" or "rl:user:42")
   * @param capacity   Max tokens the bucket can hold (burst capacity)
   * @param refillRate Tokens per second added to the bucket
   * @param cost       Tokens to consume per request (default: 1)
   * @returns { allowed, remaining, retryAfterMs }
   */
  async consume(
    key: string,
    capacity: number,
    refillRate: number,
    cost = 1,
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
    const nowMs = Date.now();

    const result = (await this.redis.eval(
      this.LUA_SCRIPT,
      1,
      key,
      capacity.toString(),
      refillRate.toString(),
      nowMs.toString(),
      cost.toString(),
    )) as [number, number, number];

    return {
      allowed: result[0] === 1,
      remaining: result[1],
      retryAfterMs: result[2],
    };
  }
}
