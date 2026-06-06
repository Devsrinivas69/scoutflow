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
import {
  generateSubject,
  generateBody,
  DEFAULT_SUBJECT_TEMPLATE,
  DEFAULT_BODY_TEMPLATE,
} from "@/lib/utils/email-template";
import type { PipelineJobData } from "./pipeline.queue";

async function updateStage(runId: string, stage: number, status?: string) {
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      currentStage: stage,
      ...(status ? { status: status as never } : {}),
    },
  });
}

export async function runPipeline(data: PipelineJobData): Promise<void> {
  const { runId, seedDomain, orgId } = data;
  console.log(`[Pipeline] Starting run ${runId} for domain: ${seedDomain}`);

  try {
    // ─── Stage 1: Ocean.io — Find Lookalike Companies ──────────────────
    await updateStage(runId, 1);
    console.log(`[Stage 1] Finding lookalike companies for ${seedDomain}...`);
    const lookalikeCompanies = await findLookalikeCompanies(seedDomain);
    console.log(`[Stage 1] Found ${lookalikeCompanies.length} companies`);

    const savedCompanies = await Promise.all(
      lookalikeCompanies
        .filter((c) => c.domain)
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
    const validCompanies = savedCompanies.filter(
      (c): c is NonNullable<typeof c> => c !== null
    );
    console.log(`[Stage 1] Saved ${validCompanies.length} companies to DB`);

    // ─── Stage 2: Prospeo — Find Decision Makers ───────────────────────
    await updateStage(runId, 2);
    console.log(`[Stage 2] Finding decision makers...`);
    const decisionMakers = await findDecisionMakers(lookalikeCompanies);
    console.log(`[Stage 2] Found ${decisionMakers.length} contacts`);

    const savedContacts = await Promise.all(
      decisionMakers.map(async (dm) => {
        const company = validCompanies.find((c) => c.domain === dm.companyDomain);
        if (!company) return null;
        const normalizedName = dm.fullName.replace(/\s+/g, '-').toLowerCase();
        try {
          return await prisma.contact.upsert({
            where: {
              runId_linkedinUrl: {
                runId,
                linkedinUrl:
                  dm.linkedinUrl ?? `prospeo-contact-${normalizedName}-${dm.companyDomain}`,
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
              sourceApi: dm.sourceApi ?? "Prospeo",
              apiResponseId: dm.apiResponseId ?? null,
              discoveryMethod: dm.discoveryMethod ?? "search-person",
              selectedReason: dm.selectedReason ?? "Decision Maker match",
            },
            update: {
              title: dm.title,
              sourceApi: dm.sourceApi ?? "Prospeo",
              apiResponseId: dm.apiResponseId ?? null,
              discoveryMethod: dm.discoveryMethod ?? "search-person",
              selectedReason: dm.selectedReason ?? "Decision Maker match",
            },
          });
        } catch {
          return null;
        }
      })
    );
    const validContacts = savedContacts.filter(
      (c): c is NonNullable<typeof c> => c !== null
    );
    console.log(`[Stage 2] Saved ${validContacts.length} contacts to DB`);

    // ─── Stage 3: Eazyreach — Resolve Work Emails ──────────────────────
    await updateStage(runId, 3);
    console.log(`[Stage 3] Resolving work emails...`);
    const verifiedEmails = await resolveWorkEmails(decisionMakers);
    console.log(`[Stage 3] Verified ${verifiedEmails.length} emails`);

    const savedEmails = await Promise.all(
      verifiedEmails.map(async (ve) => {
        // Match contact by first name + company domain
        const contact = validContacts.find(
          (c) =>
            c.firstName === ve.contactFirstName &&
            validCompanies.find((co) => co.id === c.companyId)?.domain ===
              ve.companyDomain
        );
        if (!contact) return null;
        try {
          // Update contact metadata with enrich telemetry
          await prisma.contact.update({
            where: { id: contact.id },
            data: {
              apiResponseId: ve.apiResponseId || contact.apiResponseId,
              discoveryMethod: "enrich-person",
            }
          });

          return await prisma.verifiedEmail.upsert({
            where: {
              contactId_email: { contactId: contact.id, email: ve.email },
            },
            create: {
              contactId: contact.id,
              email: ve.email,
              status: ve.status,
              verifiedAt: new Date(),
            },
            update: { status: ve.status, verifiedAt: new Date() },
          });
        } catch {
          return null;
        }
      })
    );
    const validEmails = savedEmails.filter(
      (e): e is NonNullable<typeof e> => e !== null
    );
    console.log(`[Stage 3] Saved ${validEmails.length} verified emails to DB`);

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

    console.log(`[Pipeline] Run ${runId} complete. Stats:`, stats);
  } catch (error) {
    console.error(`[Pipeline] Run ${runId} failed:`, error);
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
