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

    // Optional: user can pass edited subject/body templates
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

    // Apply any edits from the user
    if (subjectTemplate || bodyTemplate) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          ...(subjectTemplate ? { subjectTemplate } : {}),
          ...(bodyTemplate ? { bodyTemplate } : {}),
        },
      });
    }

    // Get email drafts from campaign
    const emailDrafts = (campaign.emailsJson as Array<{
      email: string;
      name: string;
      subject: string;
      body: string;
    }>) ?? [];

    if (emailDrafts.length === 0) {
      return NextResponse.json({ error: "No emails to send" }, { status: 400 });
    }

    // Mark campaign as approved
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "SENDING", approvedAt: new Date() },
    });

    await prisma.pipelineRun.update({
      where: { id: runId },
      data: { status: "APPROVED" },
    });

    // Send emails via Brevo
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

    // Mark campaign and run as completed
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "SENT", sentAt: new Date() },
    });

    await prisma.pipelineRun.update({
      where: { id: runId },
      data: { status: "COMPLETED" },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        orgId: run.orgId,
        userId: session.user.id,
        action: "campaign.sent",
        resource: campaign.id,
        metadata: { sentCount, failedCount, runId },
      },
    });

    return NextResponse.json({
      success: true,
      sentCount,
      failedCount,
      total: results.length,
    });
  } catch (error) {
    console.error("[API] Pipeline approve error:", error);
    return NextResponse.json(
      { error: "Failed to send campaign" },
      { status: 500 }
    );
  }
}
