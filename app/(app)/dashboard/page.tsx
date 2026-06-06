import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import {
  Zap, TrendingUp, Users, Mail, GitBranch,
  CheckCircle, Clock, AlertCircle, ArrowRight, Plus
} from "lucide-react";

async function getDashboardData(orgId: string) {
  const [totalRuns, totalContacts, totalEmails, recentRuns, campaigns] = await Promise.all([
    prisma.pipelineRun.count({ where: { orgId } }),
    prisma.contact.count({ where: { run: { orgId } } }),
    prisma.emailLog.count({ where: { campaign: { orgId } } }),
    prisma.pipelineRun.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, seedDomain: true, status: true, currentStage: true,
        createdAt: true, statsJson: true,
      },
    }),
    prisma.campaign.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, status: true, createdAt: true, run: { select: { seedDomain: true } } },
    }),
  ]);

  return { totalRuns, totalContacts, totalEmails, recentRuns, campaigns };
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    COMPLETED: { label: "Completed", cls: "badge-success", icon: <CheckCircle className="w-3 h-3" /> },
    RUNNING: { label: "Running", cls: "badge-warning", icon: <div className="w-2 h-2 rounded-full animate-pulse bg-amber-400" /> },
    PENDING_APPROVAL: { label: "Awaiting Approval", cls: "badge-info", icon: <Clock className="w-3 h-3" /> },
    FAILED: { label: "Failed", cls: "badge-error", icon: <AlertCircle className="w-3 h-3" /> },
    CANCELLED: { label: "Cancelled", cls: "badge-muted", icon: null },
  };
  const s = map[status] ?? { label: status, cls: "badge-muted", icon: null };
  return <span className={`badge ${s.cls}`}>{s.icon}{s.label}</span>;
}

export default async function DashboardPage() {
  const session = await auth();
  const orgId = (session?.user as { orgId?: string })?.orgId;
  if (!orgId) return null;

  const { totalRuns, totalContacts, totalEmails, recentRuns } =
    await getDashboardData(orgId);

  const metrics = [
    { label: "Pipeline Runs", value: totalRuns, icon: GitBranch, color: "#6D5DF6", trend: "+12%" },
    { label: "Prospects Found", value: totalContacts, icon: Users, color: "#8B7CFF", trend: "+28%" },
    { label: "Emails Sent", value: totalEmails, icon: Mail, color: "#00C896", trend: "+15%" },
    { label: "Avg Response Rate", value: "8.4%", icon: TrendingUp, color: "#FFB547", trend: "+2%" },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "#E8EAF6" }}>Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: "#6B7BA4" }}>
            Welcome back, {session?.user?.name?.split(" ")[0] ?? "there"} 👋
          </p>
        </div>
        <Link href="/pipeline">
          <button className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Pipeline Run
          </button>
        </Link>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="metric-card">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${m.color}22` }}>
                  <Icon className="w-5 h-5" style={{ color: m.color }} />
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full"
                  style={{ background: "rgba(0,200,150,0.1)", color: "#00C896" }}>
                  {m.trend}
                </span>
              </div>
              <div className="text-3xl font-black mb-1" style={{ color: "#E8EAF6" }}>
                {typeof m.value === "number" ? m.value.toLocaleString() : m.value}
              </div>
              <div className="text-sm" style={{ color: "#6B7BA4" }}>{m.label}</div>
            </div>
          );
        })}
      </div>

      {/* Recent Pipeline Runs */}
      <div className="rounded-2xl overflow-hidden mb-6"
        style={{ background: "rgba(18,25,43,0.7)", border: "1px solid rgba(109,93,246,0.15)" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "rgba(109,93,246,0.15)" }}>
          <h2 className="font-semibold" style={{ color: "#E8EAF6" }}>Recent Pipeline Runs</h2>
          <Link href="/pipeline" className="flex items-center gap-1 text-sm" style={{ color: "#6D5DF6" }}>
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {recentRuns.length === 0 ? (
          <div className="py-16 text-center">
            <Zap className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(109,93,246,0.3)" }} />
            <p className="font-medium" style={{ color: "#E8EAF6" }}>No pipeline runs yet</p>
            <p className="text-sm mt-1 mb-4" style={{ color: "#6B7BA4" }}>
              Enter a company domain to start your first run
            </p>
            <Link href="/pipeline">
              <button className="btn-primary">Launch First Pipeline</button>
            </Link>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Status</th>
                <th>Stage</th>
                <th>Companies</th>
                <th>Contacts</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => {
                const stats = (run.statsJson as Record<string, number>) ?? {};
                return (
                  <tr key={run.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: "rgba(109,93,246,0.1)" }}>
                          <GitBranch className="w-4 h-4" style={{ color: "#6D5DF6" }} />
                        </div>
                        <span className="font-medium" style={{ color: "#E8EAF6" }}>{run.seedDomain}</span>
                      </div>
                    </td>
                    <td><StatusBadge status={run.status} /></td>
                    <td><span style={{ color: "#6B7BA4" }}>{run.currentStage}/4</span></td>
                    <td><span style={{ color: "#E8EAF6" }}>{stats.companiesFound ?? "—"}</span></td>
                    <td><span style={{ color: "#E8EAF6" }}>{stats.contactsFound ?? "—"}</span></td>
                    <td>
                      <span style={{ color: "#6B7BA4" }} className="text-sm">
                        {new Date(run.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td>
                      <Link href={`/pipeline/${run.id}`}>
                        <button className="flex items-center gap-1 text-sm" style={{ color: "#6D5DF6" }}>
                          View <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
