"use client";

import { useState, useEffect, useCallback } from "react";
import { Mail, Globe, CheckCircle, Clock, Send, Eye } from "lucide-react";

interface Campaign {
  id: string;
  runId: string;
  status: string;
  seedDomain: string;
  subjectTemplate: string;
  bodyTemplate: string;
  emailsJson: Array<{ email: string; name: string; subject: string; body: string }> | null;
  emailCount: number;
  approvedAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

function CampaignStatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    DRAFT: { cls: "badge-muted", icon: <Clock className="w-3 h-3" /> },
    PENDING_APPROVAL: { cls: "badge-warning", icon: <Clock className="w-3 h-3" /> },
    APPROVED: { cls: "badge-info", icon: <CheckCircle className="w-3 h-3" /> },
    SENDING: { cls: "badge-warning", icon: <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> },
    SENT: { cls: "badge-success", icon: <Send className="w-3 h-3" /> },
    FAILED: { cls: "badge-error", icon: null },
  };
  const s = map[status] ?? { cls: "badge-muted", icon: null };
  return <span className={`badge ${s.cls}`}>{s.icon}{status.replace(/_/g, " ")}</span>;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns");
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-1" style={{ color: "#E8EAF6" }}>Campaigns</h1>
        <p style={{ color: "#6B7BA4" }}>All outreach campaigns across your pipeline runs</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Campaign list */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="py-20 text-center">
              <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto"
                style={{ borderColor: "#6D5DF6", borderTopColor: "transparent" }} />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="py-20 text-center rounded-2xl"
              style={{ background: "rgba(18,25,43,0.7)", border: "1px solid rgba(109,93,246,0.15)" }}>
              <Mail className="w-12 h-12 mx-auto mb-4" style={{ color: "rgba(109,93,246,0.3)" }} />
              <p className="font-medium mb-2" style={{ color: "#E8EAF6" }}>No campaigns yet</p>
              <p className="text-sm" style={{ color: "#6B7BA4" }}>Complete a pipeline run to create a campaign</p>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="rounded-2xl p-4 cursor-pointer transition-all duration-200"
                  style={{
                    background: selected?.id === c.id ? "rgba(109,93,246,0.1)" : "rgba(18,25,43,0.7)",
                    border: `1px solid ${selected?.id === c.id ? "rgba(109,93,246,0.4)" : "rgba(109,93,246,0.15)"}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: "rgba(109,93,246,0.15)" }}>
                        <Globe className="w-4 h-4" style={{ color: "#6D5DF6" }} />
                      </div>
                      <div>
                        <div className="font-semibold text-sm" style={{ color: "#E8EAF6" }}>{c.seedDomain}</div>
                        <div className="text-xs" style={{ color: "#6B7BA4" }}>{c.emailCount} emails</div>
                      </div>
                    </div>
                    <CampaignStatusBadge status={c.status} />
                  </div>
                  <p className="text-xs truncate" style={{ color: "#6B7BA4" }}>
                    Subject: {c.subjectTemplate}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#6B7BA4" }}>
                    {new Date(c.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Campaign preview */}
        <div className="lg:col-span-3">
          {!selected ? (
            <div className="h-full flex items-center justify-center py-20 rounded-2xl"
              style={{ background: "rgba(18,25,43,0.5)", border: "1px dashed rgba(109,93,246,0.2)" }}>
              <div className="text-center">
                <Eye className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(109,93,246,0.3)" }} />
                <p style={{ color: "#6B7BA4" }}>Select a campaign to preview</p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden"
              style={{ background: "rgba(18,25,43,0.7)", border: "1px solid rgba(109,93,246,0.2)" }}>
              <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(109,93,246,0.15)" }}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold" style={{ color: "#E8EAF6" }}>Campaign Preview</h3>
                  <CampaignStatusBadge status={selected.status} />
                </div>
                <p className="text-sm mt-1" style={{ color: "#6B7BA4" }}>
                  Seed: {selected.seedDomain} · {selected.emailCount} recipients
                </p>
              </div>

              <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(109,93,246,0.1)" }}>
                <div className="text-sm mb-1" style={{ color: "#6B7BA4" }}>Subject Template</div>
                <div className="font-medium" style={{ color: "#E8EAF6" }}>{selected.subjectTemplate}</div>
              </div>

              <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(109,93,246,0.1)" }}>
                <div className="text-sm mb-2" style={{ color: "#6B7BA4" }}>Body Template</div>
                <pre className="text-sm whitespace-pre-wrap font-sans" style={{ color: "#E8EAF6" }}>
                  {selected.bodyTemplate}
                </pre>
              </div>

              {selected.emailsJson && selected.emailsJson.length > 0 && (
                <div className="px-6 py-4">
                  <div className="text-sm mb-3" style={{ color: "#6B7BA4" }}>Recipients</div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {selected.emailsJson.slice(0, 20).map((em, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl"
                        style={{ background: "rgba(11,16,32,0.6)" }}>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: "rgba(109,93,246,0.15)", color: "#8B7CFF" }}>
                          {em.name?.charAt(0) ?? "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: "#E8EAF6" }}>{em.name}</div>
                          <div className="text-xs truncate" style={{ color: "#6B7BA4" }}>{em.email}</div>
                        </div>
                      </div>
                    ))}
                    {selected.emailsJson.length > 20 && (
                      <p className="text-xs text-center" style={{ color: "#6B7BA4" }}>
                        +{selected.emailsJson.length - 20} more recipients
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
