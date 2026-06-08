import { prisma } from "@/lib/db/prisma";
import { formatDistanceToNow } from "date-fns";
import { auth } from "@/lib/auth/auth.config";
import Link from "next/link";
import { Card } from "@/components/ui/card";

export default async function PipelineRunsPage() {
  const session = await auth();
  const orgId = (session?.user as { orgId?: string })?.orgId;

  if (!orgId) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No organization found for your account. Please contact support.
      </div>
    );
  }

  const runs = await prisma.pipelineRun.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      seedDomain: true,
      status: true,
      createdAt: true,
      _count: { select: { contacts: true } },
    },
  });

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight uppercase tracking-widest font-mono">
            Pipeline Runs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse and monitor all lead generation runs for your organization.
          </p>
        </div>
      </div>

      <Card className="flex flex-col overflow-hidden border border-border">
        <div className="p-6 border-b border-border bg-muted/30">
          <h3 className="text-lg font-semibold text-foreground">All Missions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-border bg-muted/10">
                <th className="px-6 py-4 font-semibold text-muted-foreground uppercase text-xs">Target</th>
                <th className="px-6 py-4 font-semibold text-muted-foreground uppercase text-xs">Status</th>
                <th className="px-6 py-4 font-semibold text-muted-foreground uppercase text-xs">Discovered</th>
                <th className="px-6 py-4 font-semibold text-muted-foreground uppercase text-xs text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((run) => (
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
              {runs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground text-sm">
                    No pipelines found. Start your first scan on the dashboard.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
