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
          include: { 
            verifiedEmails: true,
            company: true,
          },
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

    const stats = (run.statsJson as Record<string, any>) ?? {};
    const campaign = run.campaigns[0] ?? null;

    let sentCount = 0;
    let failedCount = 0;

    if (campaign) {
      const emailLogsCount = await prisma.emailLog.groupBy({
        by: ["status"],
        where: { campaignId: campaign.id },
        _count: true,
      });

      emailLogsCount.forEach((c) => {
        if (c.status === "SENT") sentCount = c._count;
        if (c.status === "FAILED") failedCount = c._count;
      });
    }

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
        apolloFallbackActivated: stats.apolloFallbackActivated ?? false,
        apolloUnavailable: stats.apolloUnavailable ?? false,
        prospeoRateLimited: stats.prospeoRateLimited ?? false,
        providerWarnings: stats.providerWarnings ?? [],
      },
      discoveryAudits: stats.discoveryAudits ?? [],
      emailDisappearedAudits: stats.emailDisappearedAudits ?? [],
      companies: run.companies.slice(0, 10).map((c) => ({
        name: c.name,
        domain: c.domain,
        industry: c.industry,
        country: c.country,
      })),
      contacts: run.contacts.slice(0, 10).map((c) => {
        const ve = c.verifiedEmails[0] ?? null;

        let emailSource = "UNKNOWN_SOURCE";
        if (ve) {
          emailSource = "REAL_EMAIL";
        }

        let cleanLinkedinUrl = null;
        if (c.linkedinUrl) {
          cleanLinkedinUrl = c.linkedinUrl.includes("-dup-")
            ? c.linkedinUrl.split("-dup-")[0]
            : c.linkedinUrl;
        }

        return {
          id: c.id,
          name: c.fullName,
          firstName: c.firstName,
          lastName: c.lastName,
          title: c.title,
          email: ve?.email ?? (c.provider === "apollo-fallback" ? "No email available from Apollo Fallback" : "No email available from Prospeo"),
          patternUsed: ve?.patternUsed ?? null,
          confidenceScore: ve?.confidenceScore ?? null,
          reasoning: ve?.reasoning ?? null,
          companyName: c.company.name,
          companyDomain: c.company.domain,
          linkedinUrl: cleanLinkedinUrl,
          qualityScore: c.qualityScore,
          status: c.status,
          reason: c.reason,
          duplicateStatus: c.duplicateStatus,
          provider: c.provider,
          failoverReason: c.failoverReason,
          emailSource,
        };
      }),
      campaign: campaign
        ? {
            id: campaign.id,
            status: campaign.status,
            subjectTemplate: campaign.subjectTemplate,
            bodyTemplate: campaign.bodyTemplate,
            emailsJson: campaign.emailsJson,
            sentCount,
            failedCount,
            errorMessage: campaign.errorMessage,
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
