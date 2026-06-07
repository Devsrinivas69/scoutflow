import { prisma } from "@/lib/db/prisma";
import { formatDistanceToNow } from "date-fns";
import { auth } from "@/lib/auth/auth.config";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardMetrics() {
  const session = await auth();
  const orgId = (session?.user as { orgId?: string })?.orgId;

  if (!orgId) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No organization found for your account. Please contact support.
      </div>
    );
  }

  const [totalProspects, activePipelines, recentRuns, emailStats] = await Promise.all([
    // Scoped to org via the run relation
    prisma.contact.count({ where: { run: { orgId } } }),
    prisma.pipelineRun.count({
      where: { orgId, status: { in: ["RUNNING", "PENDING", "PENDING_APPROVAL", "APPROVED"] } },
    }),
    prisma.pipelineRun.findMany({
      where: { orgId, userId: session?.user?.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        seedDomain: true,
        status: true,
        createdAt: true,
        _count: { select: { contacts: true } },
      },
    }),
    // Scoped to org via campaign relation
    prisma.emailLog.groupBy({
      by: ["status"],
      where: { campaign: { orgId } },
      _count: true,
    }),
  ]);

  // Calculate reply rate
  let totalSent = 0;
  let totalReplied = 0;
  emailStats.forEach((stat) => {
    if (["SENT", "DELIVERED", "OPENED", "REPLIED"].includes(stat.status))
      totalSent += stat._count;
    if (stat.status === "REPLIED") totalReplied += stat._count;
  });
  const replyRate = totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) : "0.0";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12">
      {/* Left Column: Metrics & Pipeline */}
      <div className="lg:col-span-8 flex flex-col gap-6">
        {/* Metrics Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Card className="relative group overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-4xl text-primary">groups</span>
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Total Prospects</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalProspects.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card className="relative group overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-4xl text-primary">mark_email_read</span>
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Reply Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{replyRate}%</div>
            </CardContent>
          </Card>

          <Card className="relative group overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-4xl text-primary">schedule</span>
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Active Pipelines</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{activePipelines}</span>
                <span className="text-sm font-medium text-muted-foreground">Running</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Pipelines Table */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <div className="p-6 border-b border-border flex justify-between items-center bg-muted/30">
            <h3 className="text-xl font-semibold text-foreground">Recent Pipeline Runs</h3>
            <Link href="/pipeline" className="text-primary hover:text-primary/80 text-sm font-medium uppercase tracking-wider transition-colors">View All</Link>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-border bg-muted/10">
                  <th className="px-6 py-4 font-semibold text-muted-foreground uppercase">Target</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground uppercase">Status</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground uppercase">Discovered</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground uppercase text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentRuns.map((run) => (
                  <tr key={run.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-background flex items-center justify-center border border-border">
                          <span className="material-symbols-outlined text-base text-primary">domain</span>
                        </div>
                        <Link href={`/pipeline/${run.id}`} className="font-mono text-foreground hover:underline">
                          {run.seedDomain}
                        </Link>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {["RUNNING", "PENDING", "APPROVED", "SENDING"].includes(run.status) ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></div>
                          <span className="text-[10px] font-semibold text-primary uppercase">Scanning</span>
                        </div>
                      ) : run.status === "COMPLETED" ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary border border-border">
                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground"></div>
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase">Completed</span>
                        </div>
                      ) : run.status === "COMPLETED_WITH_WARNINGS" ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/20 border border-warning/30">
                          <div className="w-1.5 h-1.5 rounded-full bg-warning"></div>
                          <span className="text-[10px] font-semibold text-warning uppercase">Completed w/ Warnings</span>
                        </div>
                      ) : run.status === "PENDING_APPROVAL" ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/20 border border-warning/30">
                          <div className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse"></div>
                          <span className="text-[10px] font-semibold text-warning uppercase">Needs Approval</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 border border-destructive/20">
                          <div className="w-1.5 h-1.5 rounded-full bg-destructive"></div>
                          <span className="text-[10px] font-semibold text-destructive uppercase">Failed</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-foreground">
                      {run._count.contacts > 0 ? run._count.contacts : "--"}
                    </td>
                    <td className="px-6 py-4 font-mono text-muted-foreground text-right">
                      {formatDistanceToNow(run.createdAt, { addSuffix: true })}
                    </td>
                  </tr>
                ))}
                {recentRuns.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground text-sm">
                      No pipelines found. Start your first scan above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
