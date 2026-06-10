import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import { registerSchema } from "@/lib/validation/schemas";
import {
  validateEmailForRegistration,
  normalizeEmail,
} from "@/lib/validation/email";
import { withRateLimit } from "@/lib/middleware/rate-limit.middleware";

export async function POST(req: NextRequest) {
  // ── Rate limit: 10/min, 30/hr per IP ──────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rateLimited = await withRateLimit(req, "auth", ip, "/api/auth/register");
  if (rateLimited) return rateLimited;

  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, password } = parsed.data;
    // Email is already normalized (trimmed + lowercased) by the Zod schema
    const email = normalizeEmail(parsed.data.email);

    // ── Full email validation: format + disposable domain + MX record ────────
    const emailCheck = await validateEmailForRegistration(email);
    if (!emailCheck.valid) {
      return NextResponse.json(
        { error: "Please enter a valid business or personal email address." },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Create org + user in a transaction
    const result = await prisma.$transaction(async (tx: any) => {
      const slug = name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
      const org = await tx.organization.create({
        data: { name: `${name}'s Organization`, slug },
      });

      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: "OWNER",
          orgId: org.id,
        },
      });

      return { user, org };
    });

    return NextResponse.json(
      { message: "Account created successfully", userId: result.user.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API] Register error:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
