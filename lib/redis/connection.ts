import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

let redisInstance: Redis | null = null;

/**
 * Returns a configured, singleton ioredis client instance.
 * Ensures maxRetriesPerRequest is set to null, which is a requirement for BullMQ.
 */
export function getRedisClient(): Redis {
  if (!redisUrl) {
    throw new Error("REDIS_URL environment variable is missing");
  }

  if (!redisInstance) {
    console.log("[Redis] Initializing client instance...");
    redisInstance = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required by BullMQ
      connectTimeout: 10000,
    });

    redisInstance.on("connect", () => {
      console.log("[Redis] Client connected successfully");
    });

    redisInstance.on("error", (err) => {
      console.error("[Redis] Client connection error:", err);
    });
  }

  return redisInstance;
}

/**
 * Performs a lightweight connect and ping check to verify Redis health.
 */
export async function checkRedisHealth(): Promise<{ status: string; error?: string }> {
  if (!redisUrl) {
    return { status: "unconfigured", error: "REDIS_URL is not set" };
  }

  try {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      connectTimeout: 5000,
      lazyConnect: true,
    });
    await client.connect();
    const result = await client.ping();
    await client.quit();

    if (result === "PONG") {
      return { status: "healthy" };
    }
    return { status: "unhealthy", error: `Unexpected ping response: ${result}` };
  } catch (err) {
    return { status: "unhealthy", error: err instanceof Error ? err.message : String(err) };
  }
}
