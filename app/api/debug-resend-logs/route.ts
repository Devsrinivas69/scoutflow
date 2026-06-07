import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: NextRequest) {
  try {
    // Query failed campaigns
    const failedCampaigns = await prisma.campaign.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Query email logs with status FAILED
    const failedEmailLogs = await prisma.emailLog.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Query recent audit logs related to campaigns
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        action: {
          in: ["campaign.failed", "campaign.sent"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      failedCampaigns: failedCampaigns.map(c => ({
        id: c.id,
        runId: c.runId,
        status: c.status,
        errorMessage: c.errorMessage,
        emailsCount: Array.isArray(c.emailsJson) ? c.emailsJson.length : 0,
        createdAt: c.createdAt,
      })),
      failedEmailLogs: failedEmailLogs.map(l => ({
        id: l.id,
        campaignId: l.campaignId,
        email: l.email,
        status: l.status,
        errorMessage: l.errorMessage,
        responseJson: l.responseJson,
        createdAt: l.createdAt,
      })),
      auditLogs,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
