import "dotenv/config";
process.env.TEST_MODE = "true";

const domains = [
  "stripe.com",
  "hubspot.com",
  "notion.so",
  "salesforce.com",
  "airtable.com",
  "airbnb.com",
  "infosys.com"
];
const userId = "cmq21al3900011pp9jezoniy7"; // srinivas
const orgId = "cmq21al3000001pp9kedjphug";  // organization

async function runTest(domain: string) {
  console.log(`\n==================================================`);
  console.log(`Starting Validation Run for: ${domain}`);
  console.log(`==================================================`);

  // Dynamically import to ensure process.env.DATABASE_URL is fully populated/overridden first
  const { prisma } = await import("../lib/db/prisma");
  const { runPipeline } = await import("../lib/queue/pipeline.processor");

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

  console.log(`Created PipelineRun record ID: ${run.id}`);

  try {
    await runPipeline({
      runId: run.id,
      seedDomain: domain,
      userId,
      orgId,
    });

    // Fetch updated record to see stats
    const updatedRun = await prisma.pipelineRun.findUnique({
      where: { id: run.id },
      include: {
        companies: true,
        contacts: {
          include: { verifiedEmails: true },
        },
      },
    });

    console.log(`\n[Run Completed] ID: ${run.id}`);
    console.log(`Status: ${updatedRun?.status}`);
    console.log(`Current Stage: ${updatedRun?.currentStage}`);
    console.log(`Stats Json:`, JSON.stringify(updatedRun?.statsJson, null, 2));
    console.log(`Companies found: ${updatedRun?.companies.length}`);
    console.log(`Contacts found: ${updatedRun?.contacts.length}`);
    
    const contactsWithEmails = updatedRun?.contacts.filter(c => c.verifiedEmails.length > 0) ?? [];
    console.log(`Contacts with verified emails: ${contactsWithEmails.length}`);
    for (const c of contactsWithEmails) {
      console.log(`  - ${c.fullName}: ${c.verifiedEmails.map(ve => `${ve.email} (${ve.status})`).join(", ")}`);
    }

  } catch (err: any) {
    console.error(`[Run Failed] ID: ${run.id} for domain ${domain}:`, err.message ?? err);
  }
}

async function main() {
  for (const domain of domains) {
    await runTest(domain);
  }
}

main()
  .catch((e) => {
    console.error("Main execution failed:", e);
    process.exit(1);
  });
