import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/lib/db/prisma";
import { pipelineQueue } from "@/lib/queue/pipeline.queue";
import { z } from "zod";

const startSchema = z.object({
  domain: z
    .string()
    .min(1, "Domain is required")
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/,
      "Please enter a valid domain (e.g. stripe.com)"
    ),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { domain } = parsed.data;
    const userId = session.user.id;
    const orgId = (session.user as { orgId?: string }).orgId;

    if (!orgId) {
      return NextResponse.json(
        { error: "No organization associated with account" },
        { status: 400 }
      );
    }

    // Create pipeline run record
    const run = await prisma.pipelineRun.create({
      data: {
        seedDomain: domain,
        status: "RUNNING",
        currentStage: 0,
        userId,
        orgId,
      },
    });

    // Enqueue the pipeline job
    await pipelineQueue.add(
      "process-pipeline",
      { runId: run.id, seedDomain: domain, userId, orgId },
      { jobId: run.id }
    );

    // Audit log
    await prisma.auditLog.create({
      data: {
        orgId,
        userId,
        action: "pipeline.start",
        resource: run.id,
        metadata: { seedDomain: domain },
      },
    });

    return NextResponse.json({ runId: run.id }, { status: 201 });
  } catch (error) {
    console.error("[API] Pipeline start error:", error);
    return NextResponse.json(
      { error: "Failed to start pipeline" },
      { status: 500 }
    );
  }
}
