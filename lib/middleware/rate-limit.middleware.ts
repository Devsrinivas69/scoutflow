import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/redis/rate-limit";

export type RateLimitPreset = "auth" | "search" | "general";

interface PresetConfig {
  perMinuteLimit: number;
  perHourLimit: number | null;
  windowSeconds: number;
}

const PRESETS: Record<RateLimitPreset, PresetConfig> = {
  /** Auth endpoints (login, register): 10/min, 30/hr per IP */
  auth: {
    perMinuteLimit: 10,
    perHourLimit: 30,
    windowSeconds: 60,
  },
  /** Search/pipeline endpoints: 30/min, 100/hr per user ID */
  search: {
    perMinuteLimit: 30,
    perHourLimit: 100,
    windowSeconds: 60,
  },
  /** General API endpoints: 60/min per user ID */
  general: {
    perMinuteLimit: 60,
    perHourLimit: null,
    windowSeconds: 60,
  },
};

/**
 * Extract the real client IP from the request, checking common proxy headers.
 */
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Structured rate-limit audit log — no sensitive data (no passwords, tokens, etc.)
 */
function logRateLimitTrigger(opts: {
  userId: string | null;
  ip: string;
  endpoint: string;
  limit: string;
  retryAfter: number;
}) {
  console.warn(
    JSON.stringify({
      event: "rate_limit_triggered",
      userId: opts.userId,
      ip: opts.ip,
      endpoint: opts.endpoint,
      limit: opts.limit,
      retryAfter: opts.retryAfter,
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * Apply a rate limit preset to the given request.
 *
 * @param req - The incoming Next.js request
 * @param preset - Which preset to apply: "auth" | "search" | "general"
 * @param identifier - The user ID (for authenticated routes) or IP (for auth routes).
 *                     For "auth" preset, always pass the IP.
 * @param endpoint - Endpoint label used for logging (e.g. "/api/auth/register")
 * @returns null if allowed, or a NextResponse(429) if rate limited
 */
export async function withRateLimit(
  req: NextRequest,
  preset: RateLimitPreset,
  identifier: string,
  endpoint: string
): Promise<NextResponse | null> {
  const config = PRESETS[preset];
  const ip = getClientIp(req);

  // ── Per-minute check ────────────────────────────────────────────────────────
  const minuteKey = `${preset}:${identifier}:1m`;
  const minuteResult = await checkRateLimit({
    key: minuteKey,
    limit: config.perMinuteLimit,
    windowSeconds: 60,
  });

  if (!minuteResult.allowed) {
    logRateLimitTrigger({
      userId: identifier,
      ip,
      endpoint,
      limit: `${config.perMinuteLimit}/min`,
      retryAfter: minuteResult.retryAfter,
    });
    return NextResponse.json(
      {
        success: false,
        error: "Rate limit exceeded",
        retryAfter: minuteResult.retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(minuteResult.retryAfter),
          "X-RateLimit-Limit": String(config.perMinuteLimit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(
            Math.floor(Date.now() / 1000) + minuteResult.retryAfter
          ),
        },
      }
    );
  }

  // ── Per-hour check (optional per preset) ────────────────────────────────────
  if (config.perHourLimit !== null) {
    const hourKey = `${preset}:${identifier}:1h`;
    const hourResult = await checkRateLimit({
      key: hourKey,
      limit: config.perHourLimit,
      windowSeconds: 3600,
    });

    if (!hourResult.allowed) {
      logRateLimitTrigger({
        userId: identifier,
        ip,
        endpoint,
        limit: `${config.perHourLimit}/hr`,
        retryAfter: hourResult.retryAfter,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Rate limit exceeded",
          retryAfter: hourResult.retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(hourResult.retryAfter),
            "X-RateLimit-Limit": String(config.perHourLimit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(
              Math.floor(Date.now() / 1000) + hourResult.retryAfter
            ),
          },
        }
      );
    }
  }

  return null; // allowed
}
