import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/lib/db/prisma";
import { withRateLimit } from "@/lib/middleware/rate-limit.middleware";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Rate limit: 30/min, 100/hr per authenticated user ───────────────────
    const rateLimited = await withRateLimit(
      req,
      "search",
      session.user.id,
      "/api/prospects"
    );
    if (rateLimited) return rateLimited;

    const orgId = (session.user as { orgId?: string }).orgId;
    if (!orgId) return NextResponse.json({ prospects: [] });

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const search = searchParams.get("q") ?? searchParams.get("search") ?? "";
    const runId = searchParams.get("runId");

    const where = {
      run: { orgId },
      ...(runId ? { runId } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" as const } },
              { title: { contains: search, mode: "insensitive" as const } },
              { company: { name: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        include: {
          company: true,
          verifiedEmails: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.contact.count({ where }),
    ]);

    return NextResponse.json({
      prospects: contacts.map((c) => ({
        id: c.id,
        name: c.fullName,
        firstName: c.firstName,
        title: c.title,
        company: c.company.name,
        companyDomain: c.company.domain,
        email: c.verifiedEmails[0]?.email ?? null,
        emailStatus: c.verifiedEmails[0]?.status ?? null,
        linkedinUrl: c.linkedinUrl,
        createdAt: c.createdAt,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("[API] Prospects error:", error);
    return NextResponse.json({ error: "Failed to fetch prospects" }, { status: 500 });
  }
}
