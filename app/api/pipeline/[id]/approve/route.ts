import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/lib/db/prisma";
import { sendOutreachEmails } from "@/lib/services/email.provider";
import { withRateLimit } from "@/lib/middleware/rate-limit.middleware";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Rate limit: 60/min per authenticated user ───────────────────────────
    const rateLimited = await withRateLimit(
      req,
      "general",
      session.user.id,
      "/api/pipeline/[id]/approve"
    );
    if (rateLimited) return rateLimited;

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

    const actingUserId = session.user.id;
    // [Resend Trace Step 1/8] Campaign approved by user, starting async outreach pipeline.
    console.log(`[Resend Trace Step 1/8] Campaign approved for run ${runId} by user ${actingUserId}. Status changed to APPROVED.`);

    // Use Next.js `after()` to schedule email delivery after the response is sent.
    // This ensures the work completes reliably — unlike void async which gets killed.
    after(async () => {
      try {
        console.log(`[Resend Trace] Campaign ${campaign.id} after() worker started.`);
        const resendStart = Date.now();
        
        // sendOutreachEmails handles Step 2 (Recipient Selection), Step 3 (Email Gen), Step 4 (Payload Build), Step 5 (API Request) & Step 6 (API Response).
        const results = await sendOutreachEmails(emailDrafts);
        const resendDuration = ((Date.now() - resendStart) / 1000).toFixed(2);
        console.log(`[Resend Trace] Resend batch completed for campaign ${campaign.id} in ${resendDuration}s`);

        console.log(`[Resend Trace Step 7/8] Database Logging: saving logs to EmailLog model for campaign ${campaign.id}`);
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
            if (!contact || !draft) {
              console.warn(`[Resend Trace] Could not associate result for email ${result.email} with contact/draft.`);
              return;
            }

            await prisma.emailLog.create({
              data: {
                campaignId: campaign.id,
                contactId: contact.id,
                email: result.email,
                subject: draft.subject,
                body: draft.body,
                status: result.success ? "SENT" : "FAILED",
                messageId: result.messageId || null,
                provider: "resend",
                errorMessage: result.error ?? null,
                requestJson: result.requestJson ?? null,
                responseJson: result.responseJson ?? null,
                sentAt: result.success ? new Date() : undefined,
              },
            });
          })
        );

        const sentCount = results.filter((r) => r.success).length;
        const failedCount = results.filter((r) => !r.success).length;
        const failureMessages = results
          .filter((r) => !r.success && r.error)
          .map((r) => `[${r.email}]: ${r.error}`)
          .join(" | ");
        const campaignErrorMessage = failedCount > 0
          ? (failureMessages || "Resend delivery failed — check SPF/DKIM verification and API key")
          : null;

        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { 
            status: sentCount > 0 ? "SENT" : "FAILED", 
            sentAt: sentCount > 0 ? new Date() : undefined,
            errorMessage: campaignErrorMessage,
          },
        });

        // Determine final run status
        const stats = (run.statsJson as any) ?? {};
        const apolloActivated = stats.apolloFallbackActivated === true || stats.stage2TimedOut === true;
        const hasWarning = failedCount > 0 || apolloActivated;

        let finalStatus: "COMPLETED" | "COMPLETED_WITH_WARNINGS" | "FAILED" = "COMPLETED";
        if (sentCount === 0) {
          finalStatus = "FAILED";
        } else if (hasWarning) {
          finalStatus = "COMPLETED_WITH_WARNINGS";
        }

        await prisma.pipelineRun.update({
          where: { id: runId },
          data: { status: finalStatus },
        });

        // [Resend Trace Step 8/8] UI Status is updated and audit logged.
        console.log(`[Resend Trace Step 8/8] UI Status: run ${runId} final status is ${finalStatus}. Approved, sent: ${sentCount}, failed: ${failedCount}.`);

        await prisma.auditLog.create({
          data: {
            orgId: run.orgId,
            userId: actingUserId,
            action: "campaign.sent",
            resource: campaign.id,
            metadata: { sentCount, failedCount, runId, finalStatus, campaignErrorMessage },
          },
        });
      } catch (err: any) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Approve] after() send failed for campaign ${campaign.id}:`, err);
        // Mark campaign as failed so user can see the error
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { 
            status: "FAILED",
            errorMessage: errMsg || "Background email delivery failed unexpectedly",
          },
        }).catch(() => {});

        // Also update the pipeline run status to FAILED
        await prisma.pipelineRun.update({
          where: { id: runId },
          data: { status: "FAILED", errorMessage: errMsg || "Email delivery failed" },
        }).catch(() => {});

        // Save failure details in AuditLog so we can query and debug
        await prisma.auditLog.create({
          data: {
            orgId: run.orgId,
            userId: actingUserId,
            action: "campaign.failed",
            resource: campaign.id,
            metadata: {
              runId,
              error: errMsg,
            },
          },
        }).catch((auditErr) => {
          console.error("[Approve] Failed to log campaign failure to AuditLog:", auditErr);
        });
      }
    });

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
