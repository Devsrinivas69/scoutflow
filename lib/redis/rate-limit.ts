import { getRedisClient } from "./connection";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // seconds until window resets
}

export interface RateLimitOptions {
  /** Unique key prefix, e.g. "auth:ip:1.2.3.4" */
  key: string;
  /** Max requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

/**
 * Atomic sliding-window rate limiter backed by Redis.
 *
 * Uses a Lua script to atomically INCR + EXPIRE in a single round-trip.
 * Gracefully degrades (allows all requests) when REDIS_URL is not set
 * so that local dev without Redis continues to work identically.
 */
export async function checkRateLimit(
  options: RateLimitOptions
): Promise<RateLimitResult> {
  if (!process.env.REDIS_URL) {
    // Dev mode — no Redis, always allow
    return { allowed: true, remaining: options.limit - 1, retryAfter: 0 };
  }

  const { key, limit, windowSeconds } = options;
  const redisKey = `rl:${key}`;

  try {
    const client = getRedisClient();

    // Atomic Lua: increment counter, set TTL on first request
    const luaScript = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      local ttl = redis.call('TTL', KEYS[1])
      return {current, ttl}
    `;

    const result = (await client.eval(
      luaScript,
      1,
      redisKey,
      String(windowSeconds)
    )) as [number, number];

    const count = result[0];
    const ttl = result[1];
    const retryAfter = ttl > 0 ? ttl : windowSeconds;

    if (count > limit) {
      return { allowed: false, remaining: 0, retryAfter };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - count),
      retryAfter,
    };
  } catch (err) {
    // Redis error — fail open to avoid blocking legitimate users
    console.error("[RateLimit] Redis error, failing open:", err);
    return { allowed: true, remaining: options.limit - 1, retryAfter: 0 };
  }
}
