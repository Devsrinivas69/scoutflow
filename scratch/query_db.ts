import "dotenv/config";
process.env.DATABASE_URL = "postgresql://postgres:vbsSszePRekhgDxluFdClyfFlqBBVXDG@acela.proxy.rlwy.net:44456/railway";

async function main() {
  const { prisma } = await import("../lib/db/prisma");

  const users = await prisma.user.findMany({
    include: {
      org: true,
    },
  });

  console.log("Users in DB:", JSON.stringify(users, null, 2));

  const runs = await prisma.pipelineRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  console.log("Latest Pipeline Runs:", JSON.stringify(runs, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
