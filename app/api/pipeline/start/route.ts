import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/lib/db/prisma";
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

/**
 * Returns true if we should use the BullMQ queue (Redis available + production).
 * In local dev without Redis, falls back to running the pipeline in-process.
 */
function shouldUseQueue(): boolean {
  // Always use the queue in production
  if (process.env.NODE_ENV === "production") return true;
  // In dev, use the queue only if REDIS_URL is explicitly configured
  return !!process.env.REDIS_URL;
}

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

    // Create the pipeline run record
    const run = await prisma.pipelineRun.create({
      data: {
        seedDomain: domain,
        status: "RUNNING",
        currentStage: 0,
        userId,
        orgId,
      },
    });

    const jobData = { runId: run.id, seedDomain: domain, userId, orgId };

    if (shouldUseQueue()) {
      // ── PRODUCTION / Redis available: enqueue via BullMQ ────────────
      // Dynamically import so the module (which requires ioredis) is only
      // loaded when Redis is actually available — avoids crash on cold dev.
      const { pipelineQueue } = await import("@/lib/queue/pipeline.queue");
      await pipelineQueue.add("process-pipeline", jobData, { jobId: run.id });
      console.log(`[Pipeline Start] Queued job for run ${run.id}`);
    } else {
      // ── DEV MODE: no Redis — run pipeline directly in-process ────────
      console.log(
        `[Pipeline Start] DEV MODE — running pipeline in-process for run ${run.id} (no Redis)`
      );
      const { runPipeline } = await import("@/lib/queue/pipeline.processor");
      // Fire-and-forget: don't await so the HTTP response returns immediately
      // and the browser can start polling for status updates
      void runPipeline(jobData).catch((err) => {
        console.error(`[Pipeline Start] In-process run failed for ${run.id}:`, err);
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        orgId,
        userId,
        action: "pipeline.start",
        resource: run.id,
        metadata: { seedDomain: domain, mode: shouldUseQueue() ? "queue" : "direct" },
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
