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
        companies: true,
        contacts: {
          include: {
            verifiedEmails: true,
            company: true,
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // Access control
    const userOrgId = (session.user as { orgId?: string }).orgId;
    if (run.orgId !== userOrgId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const companiesCount = run.companies.length;
    const contactsFound = run.contacts.filter((c) => c.status === "SELECTED").length;
    const contactsRejected = run.contacts.filter((c) => c.status === "REJECTED").length;

    let emailsGenerated = 0;
    let emailsRejected = 0;

    run.contacts.forEach((c) => {
      c.verifiedEmails.forEach((ve) => {
        if (ve.status === "VALID" || ve.status === "CATCH_ALL" || ve.status === "UNKNOWN") {
          emailsGenerated++;
        } else if (ve.status === "INVALID") {
          emailsRejected++;
        }
      });
    });

    return NextResponse.json({
      pipelineId: run.id,
      seedDomain: run.seedDomain,
      status: run.status,
      currentStage: run.currentStage,
      companiesFound: companiesCount,
      contactsFound,
      contactsRejected,
      emailsGenerated,
      emailsRejected,
      databaseRecords: {
        companies: run.companies,
        contacts: run.contacts.map((c) => ({
          id: c.id,
          fullName: c.fullName,
          firstName: c.firstName,
          lastName: c.lastName,
          title: c.title,
          qualityScore: c.qualityScore,
          status: c.status,
          reason: c.reason,
          duplicateStatus: c.duplicateStatus,
          linkedinUrl: c.linkedinUrl,
          verifiedEmails: c.verifiedEmails,
        })),
      },
    });
  } catch (error) {
    console.error("[API] Pipeline debug error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pipeline debug metrics" },
      { status: 500 }
    );
  }
}
