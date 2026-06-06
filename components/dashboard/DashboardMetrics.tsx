import { prisma } from "@/lib/db/prisma";
import { formatDistanceToNow } from "date-fns";
import { auth } from "@/lib/auth/auth.config";

export default async function DashboardMetrics() {
  const session = await auth();

  // Fetch real data from Prisma
  const [totalProspects, activePipelines, recentRuns, emailStats] = await Promise.all([
    prisma.contact.count(),
    prisma.pipelineRun.count({ where: { status: { in: ["RUNNING", "PENDING", "PENDING_APPROVAL"] } } }),
    prisma.pipelineRun.findMany({
      where: { userId: session?.user?.id },
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
    prisma.emailLog.groupBy({
      by: ['status'],
      _count: true,
    }),
  ]);

  // Calculate reply rate
  let totalSent = 0;
  let totalReplied = 0;
  emailStats.forEach((stat: any) => {
    if (['SENT', 'DELIVERED', 'OPENED', 'REPLIED'].includes(stat.status)) totalSent += stat._count;
    if (stat.status === 'REPLIED') totalReplied += stat._count;
  });
  const replyRate = totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) : "0.0";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12">
      {/* Left Column: Metrics & Pipeline */}
      <div className="lg:col-span-8 flex flex-col gap-6">
        {/* Metrics Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="glass-card p-6 rounded-xl relative group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-4xl text-[var(--color-primary)]">groups</span>
            </div>
            <p className="font-label-sm text-label-sm text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-2">Total Prospects</p>
            <div className="flex items-baseline gap-2">
              <h4 className="font-display-lg-mobile text-[32px] font-bold text-[var(--color-on-surface)]">{totalProspects}</h4>
            </div>
          </div>

          <div className="glass-card p-6 rounded-xl relative group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-4xl text-[var(--color-primary)]">mark_email_read</span>
            </div>
            <p className="font-label-sm text-label-sm text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-2">Reply Rate</p>
            <div className="flex items-baseline gap-2">
              <h4 className="font-display-lg-mobile text-[32px] font-bold text-[var(--color-on-surface)]">{replyRate}%</h4>
            </div>
          </div>

          <div className="glass-card p-6 rounded-xl relative group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-4xl text-[var(--color-primary)]">schedule</span>
            </div>
            <p className="font-label-sm text-label-sm text-[var(--color-on-surface-variant)] uppercase tracking-wider mb-2">Active Pipelines</p>
            <div className="flex items-baseline gap-2">
              <h4 className="font-display-lg-mobile text-[32px] font-bold text-[var(--color-on-surface)]">{activePipelines}</h4>
              <span className="font-label-md text-label-md text-[var(--color-on-surface-variant)]">Running</span>
            </div>
          </div>
        </div>

        {/* Recent Pipelines Table */}
        <div className="glass-card rounded-xl overflow-hidden flex-1 flex flex-col">
          <div className="p-6 border-b border-[var(--color-border-subtle)] flex justify-between items-center bg-[var(--color-surface-dim)]/30">
            <h3 className="font-headline-md text-headline-md text-[var(--color-on-surface)] text-[20px]">Recent Pipeline Runs</h3>
            <a href="/pipeline" className="text-[var(--color-primary)] hover:text-[var(--color-secondary)] font-label-sm text-label-sm uppercase tracking-wider transition-colors">View All</a>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)]/50">
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[var(--color-on-surface-variant)] uppercase opacity-70">Target</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[var(--color-on-surface-variant)] uppercase opacity-70">Status</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[var(--color-on-surface-variant)] uppercase opacity-70">Discovered</th>
                  <th className="px-6 py-4 font-label-sm text-label-sm text-[var(--color-on-surface-variant)] uppercase opacity-70 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]/30">
                {recentRuns.map((run: any) => (
                  <tr key={run.id} className="hover:bg-[var(--color-surface-container-high)]/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-[var(--color-surface-container-high)] flex items-center justify-center border border-[var(--color-border-subtle)]">
                          <span className="material-symbols-outlined text-[16px] text-[var(--color-primary)]">domain</span>
                        </div>
                        <a href={`/pipeline/${run.id}`} className="font-mono-data text-mono-data text-[var(--color-on-surface)] hover:underline">
                          {run.seedDomain}
                        </a>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {run.status === "RUNNING" || run.status === "PENDING" ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20">
                          <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] ai-aura"></div>
                          <span className="font-label-sm text-[10px] text-[var(--color-primary)] uppercase">Scanning</span>
                        </div>
                      ) : run.status === "COMPLETED" ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-surface-variant)] border border-[var(--color-outline-variant)]">
                          <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-outline)]"></div>
                          <span className="font-label-sm text-[10px] text-[var(--color-outline)] uppercase">Completed</span>
                        </div>
                      ) : run.status === "PENDING_APPROVAL" ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-tertiary-container)]/20 border border-[var(--color-tertiary)]/30">
                          <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-tertiary)] animate-pulse"></div>
                          <span className="font-label-sm text-[10px] text-[var(--color-tertiary)] uppercase">Needs Approval</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-error)]/10 border border-[var(--color-error)]/20">
                          <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-error)]"></div>
                          <span className="font-label-sm text-[10px] text-[var(--color-error)] uppercase">Failed</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono-data text-mono-data text-[var(--color-on-surface)]">
                      {run._count.contacts > 0 ? run._count.contacts : "--"}
                    </td>
                    <td className="px-6 py-4 font-mono-data text-mono-data text-[var(--color-on-surface-variant)] text-right">
                      {formatDistanceToNow(run.createdAt, { addSuffix: true })}
                    </td>
                  </tr>
                ))}
                {recentRuns.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-[var(--color-on-surface-variant)] font-mono-data text-sm">
                      No pipelines found. Start your first scan above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right Column: Activity Feed */}
      <div className="lg:col-span-4 glass-card rounded-xl flex flex-col h-[600px] lg:h-auto">
        <div className="p-6 border-b border-[var(--color-border-subtle)] flex justify-between items-center bg-[var(--color-surface-dim)]/30">
          <h3 className="font-headline-md text-headline-md text-[var(--color-on-surface)] text-[20px] flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--color-primary)]">memory</span>
            Agent Activity
          </h3>
        </div>
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          
          <div className="relative pl-6">
            <div className="absolute left-[11px] top-8 bottom-[-24px] w-px bg-[var(--color-border-subtle)]"></div>
            <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-primary)] flex items-center justify-center z-10">
              <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] ai-aura"></div>
            </div>
            <div className="bg-[var(--color-surface-container-high)]/50 border border-[var(--color-border-subtle)] rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <span className="font-label-sm text-label-sm text-[var(--color-primary)] uppercase">Scraping Logic</span>
                <span className="font-mono-data text-mono-data text-[12px] text-[var(--color-on-surface-variant)]">Just now</span>
              </div>
              <p className="font-body-md text-body-md text-[var(--color-on-surface)] text-sm">Monitoring pipeline events in real-time. Connecting to Ocean.io stream...</p>
            </div>
          </div>

          <div className="relative pl-6">
            <div className="absolute left-[11px] top-8 bottom-[-24px] w-px bg-[var(--color-border-subtle)]"></div>
            <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-[var(--color-surface-variant)] border border-[var(--color-outline-variant)] flex items-center justify-center z-10">
              <span className="material-symbols-outlined text-[14px] text-[var(--color-outline)]">mark_email_read</span>
            </div>
            <div className="bg-[var(--color-surface-container-low)] border border-[var(--color-border-subtle)]/50 rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <span className="font-label-sm text-label-sm text-[var(--color-on-surface-variant)] uppercase">System Boot</span>
                <span className="font-mono-data text-mono-data text-[12px] text-[var(--color-on-surface-variant)]">Startup</span>
              </div>
              <p className="font-body-md text-body-md text-[var(--color-on-surface)] text-sm">Auth protocols verified. Database connections established.</p>
            </div>
          </div>

        </div>
        <div className="p-4 bg-[var(--color-surface-dim)] border-t border-[var(--color-border-subtle)] rounded-b-xl flex items-center gap-2 font-mono-data text-mono-data text-xs text-[var(--color-on-surface-variant)]">
          <span className="text-[var(--color-primary)] animate-pulse">_</span> waiting for new events...
        </div>
      </div>
    </div>
  );
}
