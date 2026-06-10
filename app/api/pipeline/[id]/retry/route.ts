import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/lib/db/prisma";

/**
 * POST /api/pipeline/[id]/retry
 * Resets a FAILED campaign back to PENDING_APPROVAL so the user can
 * re-approve email delivery without re-running the full pipeline.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: runId } = await params;

    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: { campaigns: { take: 1, orderBy: { createdAt: "desc" } } },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const userOrgId = (session.user as { orgId?: string }).orgId;
    if (run.orgId !== userOrgId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const campaign = run.campaigns[0];
    if (!campaign) {
      return NextResponse.json({ error: "No campaign found for this run" }, { status: 404 });
    }

    // Only allow retry if the campaign has emails ready and was in a failed/sending state
    const emailsJson = campaign.emailsJson as Array<{ email: string; name: string; subject: string; body: string }>;
    if (!emailsJson || emailsJson.length === 0) {
      return NextResponse.json(
        { error: "No email drafts available to retry — the pipeline must be re-run." },
        { status: 400 }
      );
    }

    // Reset campaign and run back to PENDING_APPROVAL
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: "PENDING_APPROVAL",
        errorMessage: null,
        sentAt: null,
      },
    });

    await prisma.pipelineRun.update({
      where: { id: runId },
      data: { status: "PENDING_APPROVAL" },
    });

    console.log(`[Retry] Campaign ${campaign.id} reset to PENDING_APPROVAL by user ${session.user.id}`);

    return NextResponse.json({
      success: true,
      message: "Campaign reset to pending approval. You can now re-approve email delivery.",
    });
  } catch (error) {
    console.error("[API] Pipeline retry error:", error);
    return NextResponse.json(
      { error: "Failed to retry campaign" },
      { status: 500 }
    );
  }
}
