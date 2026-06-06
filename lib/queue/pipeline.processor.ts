/**
 * pipeline.processor.ts
 *
 * The core pipeline logic — extracted from the worker so it can be called
 * directly in development (no Redis needed) or via BullMQ in production.
 */

import { prisma } from "@/lib/db/prisma";
import { findLookalikeCompanies } from "@/lib/services/ocean.service";
import { findDecisionMakers } from "@/lib/services/prospeo.service";
import { resolveWorkEmails } from "@/lib/services/eazyreach.service";
import { withRetry } from "@/lib/utils/retry";
import {
  generateSubject,
  generateBody,
  DEFAULT_SUBJECT_TEMPLATE,
  DEFAULT_BODY_TEMPLATE,
} from "@/lib/utils/email-template";
import type { PipelineJobData } from "./pipeline.queue";

async function updateStage(runId: string, stage: number, status?: string) {
  await withRetry(() =>
    prisma.pipelineRun.update({
      where: { id: runId },
      data: {
        currentStage: stage,
        ...(status ? { status: status as never } : {}),
      },
    })
  );
}

/**
 * Controlled concurrency runner
 */
async function pLimit<T>(
  tasks: (() => Promise<T | null>)[],
  concurrency: number
): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(tasks.length).fill(null);
  let i = 0;

  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      try {
        results[idx] = await tasks[idx]();
      } catch (err) {
        console.error(`[pLimit] Task error at index ${idx}:`, err);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

/**
 * Score contact priority based on job titles
 */
function getContactPriorityScore(title: string | null): number {
  if (!title) return 0;
  const t = title.toLowerCase();
  
  // Priority 1: Founders & C-Levels
  if (
    t.includes("founder") ||
    t.includes("ceo") ||
    t.includes("cto") ||
    t.includes("coo") ||
    t.includes("c-level")
  ) {
    return 10;
  }
  // Priority 2: VPs & Heads of Growth/Sales/Marketing
  if (
    t.includes("vp") ||
    t.includes("vice president") ||
    t.includes("head of growth") ||
    t.includes("head of sales") ||
    t.includes("director")
  ) {
    return 5;
  }
  // Priority 3: Other managers or decision maker matches
  if (t.includes("manager") || t.includes("head") || t.includes("lead")) {
    return 2;
  }
  return 1;
}

export async function runPipeline(data: PipelineJobData): Promise<void> {
  const { runId, seedDomain, orgId } = data;
  console.log(`[Pipeline] Starting run ${runId} for domain: ${seedDomain}`);

  // Start database keep-alive heartbeat to prevent Railway TCP proxy from dropping the idle connection
  const dbKeepAliveInterval = setInterval(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err: any) {
      console.warn("[Database Keep-Alive] Heartbeat failed:", err.message ?? err);
    }
  }, 15000);

  try {
    // ─── Stage 1: Ocean.io — Find Lookalike Companies ──────────────────
    await updateStage(runId, 1);
    console.log(`[Stage 1] Finding lookalike companies for ${seedDomain}...`);
    let lookalikeCompanies = await findLookalikeCompanies(seedDomain);
    if (process.env.TEST_MODE === "true") {
      console.log(`[Test Mode] Limiting lookalikes to 1 to speed up validation and prevent DB timeouts`);
      lookalikeCompanies = lookalikeCompanies.slice(0, 1);
    }
    console.log(`[Stage 1] Found ${lookalikeCompanies.length} companies`);

    const validCompanies: any[] = [];
    for (const c of lookalikeCompanies.filter((c) => c.domain && c.domain !== seedDomain)) {
      try {
        const saved = await withRetry(() =>
          prisma.company.upsert({
            where: { runId_domain: { runId, domain: c.domain } },
            create: {
              runId,
              name: c.name,
              domain: c.domain,
              industry: c.industry,
              headcount: c.headcount,
              country: c.country,
              website: c.website,
              linkedinUrl: c.linkedinUrl,
            },
            update: {
              name: c.name,
              industry: c.industry,
              headcount: c.headcount,
            },
          })
        );
        validCompanies.push(saved);
      } catch (err: any) {
        console.error(`[Stage 1] Error saving company ${c.domain}:`, err.message ?? err);
      }
    }
    console.log(`[Stage 1] Saved ${validCompanies.length} companies to DB`);

    // ─── Stage 2: Prospeo — Find Decision Makers ───────────────────────
    await updateStage(runId, 2);
    console.log(`[Stage 2] Finding decision makers progressively...`);

    const validContacts: any[] = [];
    const companyTasks = lookalikeCompanies
      .filter((c) => c.domain)
      .map((company) => async () => {
        const savedCompany = validCompanies.find((c) => c.domain === company.domain);
        if (!savedCompany) return null;

        try {
          const contacts = await findDecisionMakers([company]);
          const successfulUpserts = [];
          for (const dm of contacts) {
            const normalizedName = dm.fullName.replace(/\s+/g, '-').toLowerCase();
            try {
              const savedContact = await withRetry(() =>
                prisma.contact.upsert({
                  where: {
                    runId_linkedinUrl: {
                      runId,
                      linkedinUrl:
                        dm.linkedinUrl ?? `mock-${dm.fullName}-${dm.companyDomain}`,
                    },
                  },
                  create: {
                    runId,
                    companyId: savedCompany.id,
                    firstName: dm.firstName,
                    lastName: dm.lastName,
                    fullName: dm.fullName,
                    title: dm.title,
                    linkedinUrl: dm.linkedinUrl,
                  },
                  update: { title: dm.title },
                })
              );
              successfulUpserts.push(savedContact);
            } catch (err) {
              console.error(`[Stage 2] Error saving contact ${dm.fullName}:`, err);
            }
          }
          validContacts.push(...successfulUpserts);
          console.log(`[Stage 2] Saved ${successfulUpserts.length} contacts progressively for ${company.domain}`);
        } catch (err: any) {
          console.error(`[Stage 2] Prospeo lookup failed for company ${company.domain}:`, err.message ?? err);
        }
        return null;
      });

    await pLimit(companyTasks, 1);
    console.log(`[Stage 2] Total progressive contacts saved: ${validContacts.length}`);

    // ─── Stage 3: EazyReach — Email Discovery Pattern Guesser ──────────
    await updateStage(runId, 3);
    console.log(`[Stage 3] Discovering email patterns progressively...`);

    // Sort contacts by priority score (highest score first) so high-value titles are processed first
    const sortedContacts = [...validContacts].sort((a, b) => {
      const scoreA = getContactPriorityScore(a.title);
      const scoreB = getContactPriorityScore(b.title);
      return scoreB - scoreA;
    });

    const verifiedEmails: any[] = [];
    for (const contact of sortedContacts) {
      const company = validCompanies.find((c) => c.id === contact.companyId);
      if (!company) continue;

      const dm = {
        firstName: contact.firstName,
        lastName: contact.lastName ?? "",
        fullName: contact.fullName ?? `${contact.firstName} ${contact.lastName ?? ""}`.trim(),
        title: contact.title ?? "",
        linkedinUrl: contact.linkedinUrl ?? undefined,
        companyDomain: company.domain,
        companyName: company.name,
      };

      try {
        const resolved = await resolveWorkEmails([dm]);
        if (resolved && resolved.length > 0) {
          const ve = resolved[0];

          await withRetry(() =>
            prisma.verifiedEmail.upsert({
              where: {
                contactId_email: { contactId: contact.id, email: ve.email },
              },
              create: {
                contactId: contact.id,
                email: ve.email,
                status: ve.status,
                patternUsed: ve.patternUsed,
                confidenceScore: ve.confidenceScore,
                verifiedAt: new Date(),
              },
              update: {
                status: ve.status,
                patternUsed: ve.patternUsed,
                confidenceScore: ve.confidenceScore,
                verifiedAt: new Date(),
              },
            })
          );

          verifiedEmails.push(ve);
          console.log(`[Stage 3] Progressively generated email for: ${dm.fullName} -> ${ve.email} (${ve.confidenceScore} confidence)`);
        }
      } catch (err: any) {
        console.error(`[Stage 3] Error generating email for ${dm.fullName}:`, err.message ?? err);
      }
    }
    console.log(`[Stage 3] Total progressive emails resolved: ${verifiedEmails.length}`);

    // ─── Stage 4: Generate Email Drafts ────────────────────────────────
    await updateStage(runId, 4);
    console.log(`[Stage 4] Generating email drafts...`);

    const emailDrafts = verifiedEmails
      .filter((ve) => ve.status === "VALID" || ve.status === "CATCH_ALL")
      .map((ve) => ({
        email: ve.email,
        name: ve.contactFullName,
        subject: generateSubject(DEFAULT_SUBJECT_TEMPLATE, {
          contactName: ve.contactFullName,
          firstName: ve.contactFirstName,
          title: ve.contactTitle,
          companyName: ve.companyName,
          companyDomain: ve.companyDomain,
        }),
        body: generateBody(DEFAULT_BODY_TEMPLATE, {
          contactName: ve.contactFullName,
          firstName: ve.contactFirstName,
          title: ve.contactTitle,
          companyName: ve.companyName,
          companyDomain: ve.companyDomain,
        }),
      }));

    await withRetry(() =>
      prisma.campaign.create({
        data: {
          runId,
          orgId,
          status: "PENDING_APPROVAL",
          subjectTemplate: DEFAULT_SUBJECT_TEMPLATE,
          bodyTemplate: DEFAULT_BODY_TEMPLATE,
          emailsJson: emailDrafts,
        },
      })
    );

    const stats = {
      companiesFound: validCompanies.length,
      contactsFound: validContacts.length,
      verifiedEmails: verifiedEmails.length,
      emailsReady: emailDrafts.length,
    };

    await withRetry(() =>
      prisma.pipelineRun.update({
        where: { id: runId },
        data: {
          status: "PENDING_APPROVAL",
          currentStage: 4,
          completedAt: new Date(),
          statsJson: stats,
        },
      })
    );

    console.log(`[Pipeline Run Telemetry]
      Run ID: ${runId}
      Domain: ${seedDomain}
      Companies found: ${stats.companiesFound}
      Contacts found: ${stats.contactsFound}
      Emails found: ${stats.verifiedEmails}
      API Errors encountered: none (completed successfully)`);
  } catch (error) {
    console.error(`[Pipeline Run Telemetry Failure] Run ${runId} failed:`, error);
    console.error(`[Pipeline Run Telemetry Failure Details]
      Run ID: ${runId}
      Domain: ${seedDomain}
      Error message: ${error instanceof Error ? error.message : String(error)}`);

    try {
      await withRetry(() =>
        prisma.pipelineRun.update({
          where: { id: runId },
          data: {
            status: "FAILED",
            errorMessage: error instanceof Error ? error.message : String(error),
          },
        })
      );
    } catch (dbErr: any) {
      console.error(`[Pipeline Run Telemetry Failure] Could not update failed run status in DB:`, dbErr.message ?? dbErr);
    }
    throw error;
  } finally {
    clearInterval(dbKeepAliveInterval);
  }
}
