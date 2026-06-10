import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

const startSchema = z.object({
  domain: z
    .string()
    .min(1, "Domain is required")
    .max(253, "Domain is too long")
    .refine(
      (d) => {
        const normalized = d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
        return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(normalized);
      },
      "Please enter a valid domain (e.g. stripe.com)"
    ),
});

/**
 * Use the BullMQ queue only if Redis is actually configured.
 * This works correctly in both dev (no Redis) and production (Redis optional).
 * If REDIS_URL is not set, the pipeline runs in-process instead.
 */
function shouldUseQueue(): boolean {
  return !!process.env.REDIS_URL;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const email = session?.user?.email;
    const authProvider = "credentials";

    // Step 1: Verify Authenticated User
    console.log("[Pipeline Start] Auth Verification Audit:", {
      userId,
      email,
      session,
      authProvider,
    });

    if (!userId) {
      console.warn("[Pipeline Start] Verification failed: No userId in session.");
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Step 2 & 3: Verify user exists in database, auto-create/sync if missing
    let user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      console.warn("[AUTH ERROR] User missing from database. Attempting auto-creation / re-sync...");
      try {
        if (email) {
          const orgId = (session?.user as { orgId?: string })?.orgId;
          if (orgId) {
            const org = await prisma.organization.findUnique({ where: { id: orgId } });
            if (!org) {
              const slug = (session?.user?.name || email.split("@")[0] || "org").toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
              await prisma.organization.create({
                data: {
                  id: orgId,
                  name: session?.user?.name ? `${session.user.name}'s Organization` : "My Organization",
                  slug,
                },
              });
            }
          }

          user = await prisma.user.create({
            data: {
              id: userId,
              email,
              name: session?.user?.name || null,
              role: (session?.user as { role?: any })?.role || "OWNER",
              orgId: orgId || null,
            },
          });
          console.log(`[AUTH SYNC] Automatically recreated missing user: ${userId}`);
        }
      } catch (syncErr) {
        console.error("[AUTH SYNC] Failed to auto-create user:", syncErr);
      }
    }

    if (!user) {
      console.error("[AUTH ERROR]\nUser missing from database");
      return NextResponse.json(
        { error: "User account not found." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { domain: rawDomain } = parsed.data;
    // Normalize: strip protocol/trailing slash, lowercase
    const domain = rawDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");

    // Step 4: Defensive PipelineRun Creation & Validation
    if (!user.id || user.id !== userId) {
      console.error("[Pipeline Start] Defensive validation failed: User ID mismatch or invalid.");
      return NextResponse.json({ error: "User account mismatch." }, { status: 400 });
    }

    const finalOrgId = user.orgId;
    if (!finalOrgId) {
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
        userId: user.id,
        orgId: finalOrgId,
      },
    });

    const jobData = { runId: run.id, seedDomain: domain, userId: user.id, orgId: finalOrgId };

    if (shouldUseQueue()) {
      // ── PRODUCTION / Redis available: enqueue via BullMQ ────────────
      // Dynamically import so the module (which requires ioredis) is only
      // loaded when Redis is actually available — avoids crash on cold dev.
      const { pipelineQueue } = await import("@/lib/queue/pipeline.queue");
      await pipelineQueue.add("process-pipeline", jobData, { jobId: run.id });
      console.log(`[Pipeline Start] Queued job for run ${run.id}`);
    } else {
      // ── No Redis — run pipeline directly in-process ────────────────
      console.log(
        `[Pipeline Start] Running pipeline in-process for run ${run.id} (no Redis)`
      );
      const { runPipeline } = await import("@/lib/queue/pipeline.processor");
      // Fire-and-forget: don't await so the HTTP response returns immediately
      // and the browser can start polling for status updates
      void runPipeline(jobData).catch((err) => {
        console.error(`[Pipeline Start] In-process run failed for ${run.id}:`, err);
      });
    }

    // Audit log — non-critical: never let this fail the response
    prisma.auditLog.create({
      data: {
        orgId: finalOrgId,
        userId: user.id,
        action: "pipeline.start",
        resource: run.id,
        metadata: { seedDomain: domain, mode: shouldUseQueue() ? "queue" : "direct" },
      },
    }).catch((err) => {
      console.warn("[Pipeline Start] Audit log failed (non-critical):", err?.message ?? err);
    });

    return NextResponse.json({ runId: run.id }, { status: 201 });
  } catch (error) {
    console.error("[API] Pipeline start error:", error);
    let errorMsg = "Failed to start pipeline";
    if (error instanceof Error) {
      if (error.message.includes("Foreign key constraint") || error.message.includes("violates foreign key constraint")) {
        errorMsg = "Database relation error: User record missing or mismatched in database.";
      } else {
        errorMsg = error.message;
      }
    }
    return NextResponse.json(
      { 
        error: errorMsg, 
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
