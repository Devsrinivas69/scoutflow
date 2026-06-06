import { getRedisClient } from "./connection";

/**
 * Get cached value from Redis by key.
 * Fails silently to prevent cache crashes when Redis is unavailable or unconfigured.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  if (!process.env.REDIS_URL) return null;
  try {
    const client = getRedisClient();
    const data = await client.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (err) {
    console.error(`[Redis Cache] Get error for key ${key}:`, err);
    return null;
  }
}

/**
 * Set value in Redis with a TTL in seconds.
 * Fails silently to prevent cache crashes when Redis is unavailable or unconfigured.
 */
export async function setCached<T>(
  key: string,
  value: T,
  ttlSeconds: number = 86400
): Promise<void> {
  if (!process.env.REDIS_URL) return;
  try {
    const client = getRedisClient();
    const stringified = JSON.stringify(value);
    await client.setex(key, ttlSeconds, stringified);
  } catch (err) {
    console.error(`[Redis Cache] Set error for key ${key}:`, err);
  }
}
