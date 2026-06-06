import { Worker, Job } from "bullmq";
import { redisConnection, type PipelineJobData } from "./pipeline.queue";
import { prisma } from "@/lib/db/prisma";
import { findLookalikeCompanies } from "@/lib/services/ocean.service";
import { findDecisionMakers } from "@/lib/services/prospeo.service";
import { resolveWorkEmails } from "@/lib/services/eazyreach.service";
import {
  generateSubject,
  generateBody,
  DEFAULT_SUBJECT_TEMPLATE,
  DEFAULT_BODY_TEMPLATE,
} from "@/lib/utils/email-template";

async function updateStage(runId: string, stage: number, status?: string) {
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      currentStage: stage,
      ...(status ? { status: status as never } : {}),
    },
  });
}

async function processPipeline(job: Job<PipelineJobData>) {
  const { runId, seedDomain, orgId } = job.data;
  console.log(`[Worker] Starting pipeline run ${runId} for domain: ${seedDomain}`);

  try {
    // ─── Stage 1: Ocean.io — Find Lookalike Companies ──────────────────────
    await updateStage(runId, 1);
    console.log(`[Stage 1] Finding lookalike companies for ${seedDomain}...`);
    const lookalikeCompanies = await findLookalikeCompanies(seedDomain);
    console.log(`[Stage 1] Found ${lookalikeCompanies.length} companies`);

    // Deduplicate and save companies
    const savedCompanies = await Promise.all(
      lookalikeCompanies
        .filter((c) => c.domain && c.domain !== seedDomain)
        .map(async (c) => {
          try {
            return await prisma.company.upsert({
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
            });
          } catch {
            return null;
          }
        })
    );
    const validCompanies = savedCompanies.filter(Boolean);
    console.log(`[Stage 1] Saved ${validCompanies.length} companies to DB`);

    // ─── Stage 2: Prospeo — Find Decision Makers ──────────────────────────
    await updateStage(runId, 2);
    console.log(`[Stage 2] Finding decision makers...`);
    const decisionMakers = await findDecisionMakers(lookalikeCompanies);
    console.log(`[Stage 2] Found ${decisionMakers.length} contacts`);

    // Save contacts with deduplication
    const savedContacts = await Promise.all(
      decisionMakers.map(async (dm) => {
        const company = validCompanies.find(
          (c: any) => c?.domain === dm.companyDomain
        );
        if (!company) return null;
        try {
          return await prisma.contact.upsert({
            where: {
              runId_linkedinUrl: {
                runId,
                linkedinUrl: dm.linkedinUrl ?? `mock-${dm.fullName}-${dm.companyDomain}`,
              },
            },
            create: {
              runId,
              companyId: company.id,
              firstName: dm.firstName,
              lastName: dm.lastName,
              fullName: dm.fullName,
              title: dm.title,
              linkedinUrl: dm.linkedinUrl,
            },
            update: {
              title: dm.title,
            },
          });
        } catch {
          return null;
        }
      })
    );
    const validContacts = savedContacts.filter(Boolean);
    console.log(`[Stage 2] Saved ${validContacts.length} contacts to DB`);

    // ─── Stage 3: Eazyreach — Resolve Work Emails ─────────────────────────
    await updateStage(runId, 3);
    console.log(`[Stage 3] Resolving work emails...`);
    const verifiedEmails = await resolveWorkEmails(decisionMakers);
    console.log(`[Stage 3] Verified ${verifiedEmails.length} emails`);

    // Save verified emails
    const savedEmails = await Promise.all(
      verifiedEmails.map(async (ve) => {
        const contact = validContacts.find(
          (c: any) =>
            c?.firstName === ve.contactFirstName &&
            c?.companyId
        );
        if (!contact) return null;
        try {
          return await prisma.verifiedEmail.upsert({
            where: {
              contactId_email: {
                contactId: contact.id,
                email: ve.email,
              },
            },
            create: {
              contactId: contact.id,
              email: ve.email,
              status: ve.status,
              verifiedAt: new Date(),
            },
            update: {
              status: ve.status,
              verifiedAt: new Date(),
            },
          });
        } catch {
          return null;
        }
      })
    );
    const validEmails = savedEmails.filter(Boolean);
    console.log(`[Stage 3] Saved ${validEmails.length} verified emails to DB`);

    // ─── Stage 4: Generate Personalized Email Drafts ─────────────────────
    await updateStage(runId, 4);
    console.log(`[Stage 4] Generating personalized email drafts...`);

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

    // Create campaign record (pending approval — EMAILS DO NOT SEND YET)
    await prisma.campaign.create({
      data: {
        runId,
        orgId,
        status: "PENDING_APPROVAL",
        subjectTemplate: DEFAULT_SUBJECT_TEMPLATE,
        bodyTemplate: DEFAULT_BODY_TEMPLATE,
        emailsJson: emailDrafts,
      },
    });

    // Update run stats
    const stats = {
      companiesFound: validCompanies.length,
      contactsFound: validContacts.length,
      verifiedEmails: validEmails.length,
      emailsReady: emailDrafts.length,
    };

    await prisma.pipelineRun.update({
      where: { id: runId },
      data: {
        status: "PENDING_APPROVAL",
        currentStage: 4,
        completedAt: new Date(),
        statsJson: stats,
      },
    });

    console.log(`[Worker] Pipeline run ${runId} complete. Stats:`, stats);
  } catch (error) {
    console.error(`[Worker] Pipeline run ${runId} failed:`, error);
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export function startWorker() {
  const worker = new Worker<PipelineJobData>("pipeline", processPipeline, {
    connection: redisConnection,
    concurrency: 2,
  });

  worker.on("completed", (job: Job) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job: Job | undefined, err: Error) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err);
  });

  worker.on("error", (err: Error) => {
    console.error("[Worker] Worker error:", err);
  });

  console.log("[Worker] Pipeline worker started");
  return worker;
}
