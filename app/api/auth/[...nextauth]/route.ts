import { NextRequest } from "next/server";
import { handlers } from "@/lib/auth/auth.config";
import { withRateLimit } from "@/lib/middleware/rate-limit.middleware";

export const GET = handlers.GET;

/**
 * Wrap the NextAuth POST handler with auth rate limiting.
 * Applies 10/min and 30/hr per IP to protect login from brute-force.
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const rateLimited = await withRateLimit(req, "auth", ip, "/api/auth/signin");
  if (rateLimited) return rateLimited;

  return handlers.POST(req);
}
