import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { checkRedisHealth } from "@/lib/redis/connection";

export async function GET() {
  let dbStatus = "healthy";
  let dbError: string | undefined;

  try {
    // Perform a lightweight database query to check connectivity
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    dbStatus = "unhealthy";
    dbError = err instanceof Error ? err.message : String(err);
  }

  // Perform a Redis ping health check
  const redisHealth = await checkRedisHealth();

  const isHealthy = dbStatus === "healthy" && redisHealth.status === "healthy";

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: dbStatus,
          ...(dbError ? { error: dbError } : {}),
        },
        redis: redisHealth,
      },
    },
    { status: isHealthy ? 200 : 503 }
  );
}
export const dynamic = "force-dynamic";
