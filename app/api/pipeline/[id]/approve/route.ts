import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/lib/db/prisma";
import { sendOutreachEmails } from "@/lib/services/brevo.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: runId } = await params;
    const body = await req.json().catch(() => ({}));

    const { subjectTemplate, bodyTemplate } = body as {
      subjectTemplate?: string;
      bodyTemplate?: string;
    };

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

    if (run.status !== "PENDING_APPROVAL") {
      return NextResponse.json(
        { error: `Campaign is not pending approval. Current status: ${run.status}` },
        { status: 400 }
      );
    }

    const campaign = run.campaigns[0];
    if (!campaign) {
      return NextResponse.json({ error: "No campaign found for this run" }, { status: 404 });
    }

    // Apply any template edits from the user
    if (subjectTemplate || bodyTemplate) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          ...(subjectTemplate ? { subjectTemplate } : {}),
          ...(bodyTemplate ? { bodyTemplate } : {}),
        },
      });
    }

    const emailDrafts = (campaign.emailsJson as Array<{
      email: string;
      name: string;
      subject: string;
      body: string;
    }>) ?? [];

    if (emailDrafts.length === 0) {
      return NextResponse.json({ error: "No emails to send" }, { status: 400 });
    }

    // Mark as SENDING immediately so the UI updates
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "SENDING", approvedAt: new Date() },
    });

    await prisma.pipelineRun.update({
      where: { id: runId },
      data: { status: "APPROVED" },
    });

    // Respond immediately — don't block the HTTP request on email delivery
    // The actual sending happens asynchronously after response is sent
    const actingUserId = session.user.id; // capture before async boundary
    void (async () => {
      try {
        const results = await sendOutreachEmails(emailDrafts);

        // Save email logs
        const contacts = await prisma.contact.findMany({
          where: { runId },
          include: { verifiedEmails: true },
        });

        await Promise.all(
          results.map(async (result) => {
            const contact = contacts.find((c) =>
              c.verifiedEmails.some((ve) => ve.email === result.email)
            );
            const draft = emailDrafts.find((d) => d.email === result.email);
            if (!contact || !draft) return;

            await prisma.emailLog.create({
              data: {
                campaignId: campaign.id,
                contactId: contact.id,
                email: result.email,
                subject: draft.subject,
                body: draft.body,
                status: result.success ? "SENT" : "FAILED",
                brevoMsgId: result.messageId,
                sentAt: result.success ? new Date() : undefined,
              },
            });
          })
        );

        const sentCount = results.filter((r) => r.success).length;
        const failedCount = results.filter((r) => !r.success).length;

        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: "SENT", sentAt: new Date() },
        });

        await prisma.pipelineRun.update({
          where: { id: runId },
          data: { status: "COMPLETED" },
        });

        await prisma.auditLog.create({
          data: {
            orgId: run.orgId,
            userId: actingUserId,
            action: "campaign.sent",
            resource: campaign.id,
            metadata: { sentCount, failedCount, runId },
          },
        });

        console.log(`[Approve] Campaign ${campaign.id} sent: ${sentCount} ok, ${failedCount} failed`);
      } catch (err) {
        console.error(`[Approve] Background send failed for campaign ${campaign.id}:`, err);
        // Mark campaign as failed so user can see the error
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: "FAILED" },
        }).catch(() => {});
      }
    })();

    // Return immediately — the UI will poll for status updates
    return NextResponse.json({
      success: true,
      message: "Campaign approved. Emails are being sent.",
      total: emailDrafts.length,
    });
  } catch (error) {
    console.error("[API] Pipeline approve error:", error);
    return NextResponse.json(
      { error: "Failed to approve campaign" },
      { status: 500 }
    );
  }
}
