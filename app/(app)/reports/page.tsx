import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/lib/db/prisma";
import { BarChart3, TrendingUp, Mail, Send, Eye, Reply } from "lucide-react";

async function getReportData(orgId: string) {
  const [totalEmails, sentEmails, openedEmails, repliedEmails, runs] = await Promise.all([
    prisma.emailLog.count({ where: { campaign: { orgId } } }),
    prisma.emailLog.count({ where: { campaign: { orgId }, status: "SENT" } }),
    prisma.emailLog.count({ where: { campaign: { orgId }, status: "OPENED" } }),
    prisma.emailLog.count({ where: { campaign: { orgId }, status: "REPLIED" } }),
    prisma.pipelineRun.findMany({
      where: { orgId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, seedDomain: true, statsJson: true, createdAt: true, completedAt: true },
    }),
  ]);

  const deliveryRate = totalEmails > 0 ? ((sentEmails / totalEmails) * 100).toFixed(1) : "0";
  const openRate = sentEmails > 0 ? ((openedEmails / sentEmails) * 100).toFixed(1) : "0";
  const responseRate = sentEmails > 0 ? ((repliedEmails / sentEmails) * 100).toFixed(1) : "0";

  return { totalEmails, sentEmails, openedEmails, repliedEmails, deliveryRate, openRate, responseRate, runs };
}

export default async function ReportsPage() {
  const session = await auth();
  const orgId = (session?.user as { orgId?: string })?.orgId;
  if (!orgId) {
    return (
      <div className="p-8">
        <p style={{ color: "#6B7BA4" }}>
          No organization found. Please sign out and sign in again.
        </p>
      </div>
    );
  }

  const { totalEmails, sentEmails, openedEmails, repliedEmails, deliveryRate, openRate, responseRate, runs } =
    await getReportData(orgId);

  const metrics = [
    { label: "Total Emails", value: totalEmails, icon: Mail, color: "#6D5DF6" },
    { label: "Emails Sent", value: sentEmails, icon: Send, color: "#8B7CFF" },
    { label: "Delivery Rate", value: `${deliveryRate}%`, icon: TrendingUp, color: "#00C896" },
    { label: "Open Rate", value: `${openRate}%`, icon: Eye, color: "#FFB547" },
    { label: "Response Rate", value: `${responseRate}%`, icon: Reply, color: "#FF5A5F" },
    { label: "Emails Opened", value: openedEmails, icon: Eye, color: "#a78bfa" },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-1" style={{ color: "#E8EAF6" }}>Reports</h1>
        <p style={{ color: "#6B7BA4" }}>Campaign analytics and performance overview</p>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="metric-card">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${m.color}22` }}>
                  <Icon className="w-5 h-5" style={{ color: m.color }} />
                </div>
              </div>
              <div className="text-3xl font-black mb-1" style={{ color: "#E8EAF6" }}>
                {typeof m.value === "number" ? m.value.toLocaleString() : m.value}
              </div>
              <div className="text-sm" style={{ color: "#6B7BA4" }}>{m.label}</div>
            </div>
          );
        })}
      </div>

      {/* Funnel visualization */}
      <div className="rounded-2xl p-6 mb-6"
        style={{ background: "rgba(18,25,43,0.7)", border: "1px solid rgba(109,93,246,0.15)" }}>
        <h2 className="font-semibold mb-6" style={{ color: "#E8EAF6" }}>Email Funnel</h2>
        <div className="space-y-3">
          {[
            { label: "Emails Prepared", value: totalEmails, color: "#6D5DF6" },
            { label: "Emails Sent", value: sentEmails, color: "#8B7CFF", pct: totalEmails > 0 ? (sentEmails / totalEmails) * 100 : 0 },
            { label: "Emails Opened", value: openedEmails, color: "#FFB547", pct: sentEmails > 0 ? (openedEmails / sentEmails) * 100 : 0 },
            { label: "Replies Received", value: repliedEmails, color: "#00C896", pct: openedEmails > 0 ? (repliedEmails / openedEmails) * 100 : 0 },
          ].map((item, i) => (
            <div key={i}>
              <div className="flex justify-between text-sm mb-1.5">
                <span style={{ color: "#E8EAF6" }}>{item.label}</span>
                <span style={{ color: item.color }}>
                  {item.value.toLocaleString()}
                  {item.pct !== undefined && ` (${item.pct.toFixed(1)}%)`}
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden"
                style={{ background: "rgba(109,93,246,0.1)" }}>
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${totalEmails > 0 ? (item.value / totalEmails) * 100 : 0}%`,
                    background: item.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline run history */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "rgba(18,25,43,0.7)", border: "1px solid rgba(109,93,246,0.15)" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(109,93,246,0.15)" }}>
          <h2 className="font-semibold" style={{ color: "#E8EAF6" }}>Completed Pipeline Runs</h2>
        </div>
        {runs.length === 0 ? (
          <div className="py-16 text-center">
            <BarChart3 className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(109,93,246,0.3)" }} />
            <p style={{ color: "#6B7BA4" }}>No completed runs yet</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Companies</th>
                <th>Contacts</th>
                <th>Verified</th>
                <th>Ready</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const stats = (r.statsJson as Record<string, number>) ?? {};
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="font-medium" style={{ color: "#E8EAF6" }}>{r.seedDomain}</span>
                    </td>
                    <td><span style={{ color: "#E8EAF6" }}>{stats.companiesFound ?? "—"}</span></td>
                    <td><span style={{ color: "#E8EAF6" }}>{stats.contactsFound ?? "—"}</span></td>
                    <td><span style={{ color: "#E8EAF6" }}>{stats.verifiedEmails ?? "—"}</span></td>
                    <td><span style={{ color: "#00C896" }}>{stats.emailsReady ?? "—"}</span></td>
                    <td>
                      <span style={{ color: "#6B7BA4" }}>
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
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
