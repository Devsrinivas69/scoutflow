import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const run = await prisma.pipelineRun.findUnique({
      where: { id },
      include: {
        companies: { orderBy: { createdAt: "asc" }, take: 25 },
        contacts: {
          orderBy: { createdAt: "asc" },
          take: 50,
          include: { verifiedEmails: true },
        },
        campaigns: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // Ensure user has access (same org)
    const userOrgId = (session.user as { orgId?: string }).orgId;
    if (run.orgId !== userOrgId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const stats = (run.statsJson as Record<string, number>) ?? {};
    const campaign = run.campaigns[0] ?? null;

    return NextResponse.json({
      id: run.id,
      seedDomain: run.seedDomain,
      status: run.status,
      currentStage: run.currentStage,
      errorMessage: run.errorMessage,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
      stats: {
        companiesFound: stats.companiesFound ?? run.companies.length,
        contactsFound: stats.contactsFound ?? run.contacts.length,
        verifiedEmails:
          stats.verifiedEmails ??
          run.contacts.reduce((acc, c) => acc + c.verifiedEmails.length, 0),
        emailsReady: stats.emailsReady ?? 0,
      },
      companies: run.companies.slice(0, 10).map((c) => ({
        name: c.name,
        domain: c.domain,
        industry: c.industry,
        country: c.country,
      })),
      contacts: run.contacts.slice(0, 10).map((c) => ({
        name: c.fullName,
        title: c.title,
        email: c.verifiedEmails[0]?.email ?? null,
      })),
      campaign: campaign
        ? {
            id: campaign.id,
            status: campaign.status,
            subjectTemplate: campaign.subjectTemplate,
            bodyTemplate: campaign.bodyTemplate,
            emailsJson: campaign.emailsJson,
          }
        : null,
    });
  } catch (error) {
    console.error("[API] Pipeline status error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pipeline status" },
      { status: 500 }
    );
  }
}
