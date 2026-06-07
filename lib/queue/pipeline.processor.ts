/**
 * pipeline.processor.ts
 *
 * The core pipeline logic — extracted from the worker so it can be called
 * directly in development (no Redis needed) or via BullMQ in production.
 */

import { prisma } from "@/lib/db/prisma";
import { findLookalikeCompanies } from "@/lib/services/ocean.service";
import { findDecisionMakers, RateLimitError } from "@/lib/services/prospeo.service";
import { findDecisionMakersApollo } from "@/lib/services/apollo.service";
import { auditAndScoreContacts } from "@/lib/services/contact-audit.service";
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
  const pipelineStartTime = Date.now();
  console.log(`[Milestone] Pipeline Started for run ${runId} at ${new Date(pipelineStartTime).toISOString()}`);

  // Start database keep-alive heartbeat to prevent Railway TCP proxy from dropping the idle connection
  const dbKeepAliveInterval = setInterval(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err: any) {
      console.warn("[Database Keep-Alive] Heartbeat failed:", err.message ?? err);
    }
  }, 15000);

  let stage2TimedOut = false;

  try {
    // ─── Stage 1: Ocean.io — Find Lookalike Companies ──────────────────
    await updateStage(runId, 1);
    const stage1StartTime = Date.now();
    console.log(`[Milestone] Ocean Started at ${new Date(stage1StartTime).toISOString()}`);

    let lookalikeCompanies = await Promise.race([
      findLookalikeCompanies(seedDomain),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Ocean.io search timed out after 30 seconds")), 30000)
      )
    ]);

    if (process.env.TEST_MODE === "true") {
      console.log(`[Test Mode] Limiting lookalikes to 1 to speed up validation and prevent DB timeouts`);
      lookalikeCompanies = lookalikeCompanies.slice(0, 1);
    }
    const stage1Duration = ((Date.now() - stage1StartTime) / 1000).toFixed(2);
    console.log(`[Milestone] Ocean Completed in ${stage1Duration}s — Found ${lookalikeCompanies.length} companies`);

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
    const stage2StartTime = Date.now();
    console.log(`[Milestone] Prospeo Started at ${new Date(stage2StartTime).toISOString()}`);

    const validContacts: any[] = [];
    const companyTasks = lookalikeCompanies
      .filter((c) => c.domain)
      .map((company) => async () => {
        const savedCompany = validCompanies.find((c) => c.domain === company.domain);
        if (!savedCompany) return null;

        let contacts: any[] = [];
        let isFallback = false;
        let failoverReason: string | null = null;

        try {
          contacts = await findDecisionMakers([company]);
        } catch (err: any) {
          const isFallbackTrigger =
            err.name === "RateLimitError" ||
            err.message?.includes("429") ||
            err.message?.toLowerCase().includes("rate limit") ||
            err.message?.includes("403") ||
            err.message?.includes("500") ||
            err.message?.includes("502") ||
            err.message?.includes("503") ||
            err.message?.includes("504") ||
            err.message?.toLowerCase().includes("timeout") ||
            err.message?.toLowerCase().includes("abort");

          if (isFallbackTrigger) {
            const reason = (err.name === "RateLimitError" || err.message?.includes("429")) ? "prospeo-rate-limit" : "prospeo-api-error";
            console.warn(`[Stage 2] Prospeo failed (Error: ${err.message}) for ${company.domain}. Activating Apollo fallback...`);
            isFallback = true;
            failoverReason = reason;
            try {
              console.log(`[Milestone] Apollo Fallback Started for ${company.domain}`);
              const startApollo = Date.now();
              contacts = await findDecisionMakersApollo([company]);
              const apolloDuration = ((Date.now() - startApollo) / 1000).toFixed(2);
              console.log(`[Milestone] Apollo Fallback Completed for ${company.domain} in ${apolloDuration}s`);
            } catch (apolloErr: any) {
              console.error(`[Stage 2] Apollo fallback also failed for ${company.domain}:`, apolloErr.message ?? apolloErr);
            }
          } else {
            console.error(`[Stage 2] Prospeo lookup failed for company ${company.domain} with non-fallback error:`, err.message ?? err);
          }
        }

        try {
          let auditedContacts = auditAndScoreContacts(contacts, company.domain);
          if (process.env.TEST_MODE === "true") {
            console.log(`[Test Mode] Limiting contacts to 2 to speed up validation and prevent DB timeouts`);
            auditedContacts = auditedContacts.slice(0, 2);
          }
          const successfulUpserts = [];
          
          for (const dm of auditedContacts) {
            try {
              let storedLinkedinUrl = dm.linkedinUrl ?? null;
              if (dm.duplicateStatus === "DUPLICATE" && storedLinkedinUrl) {
                storedLinkedinUrl = storedLinkedinUrl + `-dup-${Math.random().toString(36).substring(2, 6)}`;
              }

              // Check if contact already exists in this run
              let existingContact = null;
              if (storedLinkedinUrl) {
                existingContact = await prisma.contact.findUnique({
                  where: {
                    runId_linkedinUrl: {
                      runId,
                      linkedinUrl: storedLinkedinUrl,
                    }
                  }
                });
              } else {
                existingContact = await prisma.contact.findFirst({
                  where: {
                    runId,
                    fullName: dm.fullName,
                    companyId: savedCompany.id,
                  }
                });
              }

              let savedContact;
              if (existingContact) {
                savedContact = await withRetry(() =>
                  prisma.contact.update({
                    where: { id: existingContact.id },
                    data: {
                      title: dm.title,
                      qualityScore: dm.qualityScore,
                      status: dm.status,
                      reason: dm.reason,
                      duplicateStatus: dm.duplicateStatus,
                      provider: isFallback ? "apollo-fallback" : "prospeo",
                      failoverReason: isFallback ? failoverReason : null,
                    }
                  })
                );
              } else {
                savedContact = await withRetry(() =>
                  prisma.contact.create({
                    data: {
                      runId,
                      companyId: savedCompany.id,
                      firstName: dm.firstName,
                      lastName: dm.lastName,
                      fullName: dm.fullName,
                      title: dm.title,
                      linkedinUrl: storedLinkedinUrl,
                      qualityScore: dm.qualityScore,
                      status: dm.status,
                      reason: dm.reason,
                      duplicateStatus: dm.duplicateStatus,
                      provider: isFallback ? "apollo-fallback" : "prospeo",
                      failoverReason: isFallback ? failoverReason : null,
                    }
                  })
                );
              }
              successfulUpserts.push(savedContact);
              validContacts.push(savedContact);

              if (dm.email) {
                const realEmail = dm.email;
                const emailReasoning = isFallback
                  ? "Real email obtained from legitimate source (Apollo API Fallback)"
                  : "Real email obtained from legitimate source (Prospeo API)";

                await withRetry(() =>
                  prisma.verifiedEmail.upsert({
                    where: {
                      contactId_email: { contactId: savedContact.id, email: realEmail },
                    },
                    create: {
                      contactId: savedContact.id,
                      email: realEmail,
                      status: "VALID",
                      reasoning: emailReasoning,
                      verifiedAt: new Date(),
                    },
                    update: {
                      status: "VALID",
                      reasoning: emailReasoning,
                      verifiedAt: new Date(),
                    },
                  })
                );
                console.log(`[Stage 2] Saved real email: ${realEmail} for ${dm.fullName}`);
              }
            } catch (err) {
              console.error(`[Stage 2] Error saving contact ${dm.fullName}:`, err);
            }
          }
          console.log(`[Stage 2] Saved ${successfulUpserts.length} contacts progressively for ${company.domain}`);
        } catch (err: any) {
          console.error(`[Stage 2] Processing contacts failed for company ${company.domain}:`, err.message ?? err);
        }
        return null;
      });

    try {
      await Promise.race([
        pLimit(companyTasks, 1),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("Stage 2 Contact Discovery timed out after 20 seconds")), 20000)
        )
      ]);
    } catch (err: any) {
      if (err.message?.includes("timed out")) {
        console.warn(`[Stage 2] Progressive contact discovery timed out. Proceeding with already found contacts.`);
        stage2TimedOut = true;
      } else {
        throw err;
      }
    }

    const stage2Duration = ((Date.now() - stage2StartTime) / 1000).toFixed(2);
    console.log(`[Milestone] Prospeo Completed in ${stage2Duration}s — Total progressive contacts saved: ${validContacts.length}`);

    // ─── Stage 3: Email Discovery ──────────────────────────────────────
    await updateStage(runId, 3);
    const stage3StartTime = Date.now();
    console.log(`[Milestone] Email Discovery Started at ${new Date(stage3StartTime).toISOString()}`);

    const sortedContacts = [...validContacts]
      .filter((c) => c.status === "SELECTED")
      .sort((a, b) => {
        const scoreA = getContactPriorityScore(a.title);
        const scoreB = getContactPriorityScore(b.title);
        return scoreB - scoreA;
      });

    const verifiedEmails: any[] = [];
    
    // Perform database lookup for verified emails inside a Promise.race timeout block for safety
    await Promise.race([
      (async () => {
        for (const contact of sortedContacts) {
          const company = validCompanies.find((c) => c.id === contact.companyId);
          if (!company) continue;

          // Fetch real email saved in Stage 2 from provider
          const existingEmail = await prisma.verifiedEmail.findFirst({
            where: { contactId: contact.id },
          });

          if (existingEmail) {
            console.log(`[Stage 3] Found provider-sourced email for ${contact.fullName}: ${existingEmail.email}`);
            verifiedEmails.push({
              email: existingEmail.email,
              contactFullName: contact.fullName,
              contactFirstName: contact.firstName,
              contactTitle: contact.title,
              companyName: company.name,
              companyDomain: company.domain,
              status: existingEmail.status,
              patternUsed: null,
              confidenceScore: null,
              reasoning: existingEmail.reasoning,
            });
          }
        }
      })(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Stage 3 Email Discovery timed out after 20 seconds")), 20000)
      )
    ]).catch((err) => {
      console.warn(`[Stage 3] Email Discovery encountered a timeout/error: ${err.message}. Proceeding with gathered emails.`);
    });

    const stage3Duration = ((Date.now() - stage3StartTime) / 1000).toFixed(2);
    console.log(`[Milestone] Email Discovery Completed in ${stage3Duration}s — Total real emails gathered: ${verifiedEmails.length}`);

    // ─── Stage 4: Generate Email Drafts ────────────────────────────────
    await updateStage(runId, 4);
    console.log(`[Stage 4] Generating email drafts...`);

    const emailDrafts = verifiedEmails
      .filter((ve) => ve.status === "VALID" || ve.status === "CATCH_ALL" || ve.status === "UNKNOWN")
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

    const isApolloUsed = validContacts.some(c => c.provider === "apollo-fallback");
    const stats = {
      companiesFound: validCompanies.length,
      contactsFound: validContacts.length,
      verifiedEmails: verifiedEmails.length,
      emailsReady: emailDrafts.length,
      apolloFallbackActivated: isApolloUsed,
      stage2TimedOut,
    };

    const totalDuration = ((Date.now() - pipelineStartTime) / 1000).toFixed(2);

    if (emailDrafts.length === 0) {
      // Continuation Logic: if 0 emails are ready, transition to COMPLETED_WITH_WARNINGS and Campaign FAILED
      await withRetry(() =>
        prisma.campaign.create({
          data: {
            runId,
            orgId,
            status: "FAILED",
            subjectTemplate: DEFAULT_SUBJECT_TEMPLATE,
            bodyTemplate: DEFAULT_BODY_TEMPLATE,
            emailsJson: [],
          },
        })
      );

      await withRetry(() =>
        prisma.pipelineRun.update({
          where: { id: runId },
          data: {
            status: "COMPLETED_WITH_WARNINGS",
            currentStage: 4,
            completedAt: new Date(),
            statsJson: stats,
            errorMessage: "No contact emails found",
          },
        })
      );

      console.log(`[Milestone] Pipeline Completed with Warnings in ${totalDuration}s — No emails found. Run ID: ${runId}`);
    } else {
      // Normal flow: transition to PENDING_APPROVAL
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

      console.log(`[Milestone] Pipeline Completed in ${totalDuration}s — Run ID: ${runId} (Status: PENDING_APPROVAL, Drafts: ${emailDrafts.length})`);
    }

  } catch (error) {
    const totalDuration = ((Date.now() - pipelineStartTime) / 1000).toFixed(2);
    console.error(`[Milestone] Pipeline Failed in ${totalDuration}s — Run ID: ${runId} error:`, error);
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
