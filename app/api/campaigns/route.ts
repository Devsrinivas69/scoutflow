import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = (session.user as { orgId?: string }).orgId;
    if (!orgId) return NextResponse.json({ campaigns: [] });

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "20");

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where: { orgId },
        include: {
          run: { select: { seedDomain: true, statsJson: true } },
          _count: { select: { emailLogs: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.campaign.count({ where: { orgId } }),
    ]);

    return NextResponse.json({
      campaigns: campaigns.map((c) => ({
        id: c.id,
        runId: c.runId,
        status: c.status,
        seedDomain: c.run.seedDomain,
        subjectTemplate: c.subjectTemplate,
        bodyTemplate: c.bodyTemplate,
        emailsJson: c.emailsJson,
        emailCount: c._count.emailLogs,
        approvedAt: c.approvedAt,
        sentAt: c.sentAt,
        createdAt: c.createdAt,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("[API] Campaigns error:", error);
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}
