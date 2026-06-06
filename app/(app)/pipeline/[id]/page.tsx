"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Search, Users, Shield, Mail, CheckCircle, Clock,
  AlertCircle, Loader2, Send, X, Globe, ArrowRight, Edit3
} from "lucide-react";

interface PipelineStatus {
  id: string;
  seedDomain: string;
  status: string;
  currentStage: number;
  errorMessage?: string;
  stats: {
    companiesFound: number;
    contactsFound: number;
    verifiedEmails: number;
    emailsReady: number;
  };
  companies: Array<{ name: string; domain: string; industry?: string; country?: string }>;
  contacts: Array<{ name: string; title: string; email: string | null }>;
  campaign: {
    id: string;
    status: string;
    subjectTemplate: string;
    bodyTemplate: string;
    emailsJson: Array<{ email: string; name: string; subject: string; body: string }>;
  } | null;
}

const STAGES = [
  { num: 1, icon: Search, label: "Company Discovery", api: "Ocean.io", desc: "Finding lookalike companies" },
  { num: 2, icon: Users, label: "Decision Makers", api: "Prospeo", desc: "Identifying key contacts" },
  { num: 3, icon: Shield, label: "Email Verification", api: "Eazyreach", desc: "Verifying work emails" },
  { num: 4, icon: Mail, label: "Outreach Generation", api: "Brevo", desc: "Drafting personalized emails" },
];

function StageCard({
  stage, currentStage, status,
}: {
  stage: typeof STAGES[0];
  currentStage: number;
  status: string;
}) {
  const Icon = stage.icon;
  const isActive = currentStage === stage.num && status === "RUNNING";
  const isDone = currentStage > stage.num || (status !== "RUNNING" && status !== "PENDING" && status !== "FAILED" && currentStage >= stage.num);
  const isFailed = status === "FAILED" && currentStage === stage.num;
  const isPending = currentStage < stage.num;

  const stateColor = isFailed ? "#FF5A5F" : isDone ? "#00C896" : isActive ? "#6D5DF6" : "rgba(109,93,246,0.2)";

  return (
    <div
      className="stage-card flex items-center gap-4 transition-all duration-500"
      style={{
        borderColor: stateColor,
        boxShadow: isActive ? `0 0 30px rgba(109,93,246,0.25)` : isDone ? "0 0 20px rgba(0,200,150,0.1)" : "none",
        opacity: isPending ? 0.5 : 1,
      }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${stateColor}22` }}
      >
        {isActive ? (
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#6D5DF6" }} />
        ) : isFailed ? (
          <AlertCircle className="w-6 h-6" style={{ color: "#FF5A5F" }} />
        ) : isDone ? (
          <CheckCircle className="w-6 h-6" style={{ color: "#00C896" }} />
        ) : (
          <Icon className="w-6 h-6" style={{ color: "rgba(109,93,246,0.4)" }} />
        )}
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold" style={{ color: "#E8EAF6" }}>{stage.label}</span>
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: "rgba(109,93,246,0.1)", color: "#6D5DF6" }}>
            {stage.api}
          </span>
        </div>
        <p className="text-sm" style={{ color: "#6B7BA4" }}>
          {isActive ? stage.desc + "..." : isDone ? "Complete" : isFailed ? "Failed" : "Waiting"}
        </p>
      </div>

      <div className="text-xs font-bold px-2 py-1 rounded-full"
        style={{
          background: isActive ? "rgba(109,93,246,0.15)" : isDone ? "rgba(0,200,150,0.15)" : "rgba(107,123,164,0.1)",
          color: isActive ? "#8B7CFF" : isDone ? "#00C896" : "#6B7BA4",
        }}>
        {isActive ? "Running" : isDone ? "Done" : isFailed ? "Error" : "Pending"}
      </div>
    </div>
  );
}

function ApprovalCheckpoint({
  data, onApprove, onCancel
}: {
  data: PipelineStatus;
  onApprove: (subject: string, body: string) => void;
  onCancel: () => void;
}) {
  const [subjectTemplate, setSubjectTemplate] = useState(data.campaign?.subjectTemplate ?? "");
  const [bodyTemplate, setBodyTemplate] = useState(data.campaign?.bodyTemplate ?? "");
  const [editing, setEditing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);

  const emails = data.campaign?.emailsJson ?? [];
  const preview = emails[previewIdx];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(11,16,32,0.9)", backdropFilter: "blur(20px)" }}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl"
        style={{ background: "#12192B", border: "1px solid rgba(109,93,246,0.3)" }}>
        {/* Header */}
        <div className="px-8 py-6 border-b" style={{ borderColor: "rgba(109,93,246,0.15)" }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(255,181,71,0.15)" }}>
              <CheckCircle className="w-5 h-5" style={{ color: "#FFB547" }} />
            </div>
            <h2 className="text-2xl font-bold" style={{ color: "#E8EAF6" }}>Approval Required</h2>
          </div>
          <p style={{ color: "#6B7BA4" }}>
            Review your campaign before sending. Emails will NOT be sent until you approve.
          </p>
        </div>

        {/* Stats summary */}
        <div className="px-8 py-6 border-b" style={{ borderColor: "rgba(109,93,246,0.15)" }}>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Seed Domain", value: data.seedDomain },
              { label: "Companies", value: data.stats.companiesFound },
              { label: "Verified Emails", value: data.stats.verifiedEmails },
              { label: "Emails Ready", value: emails.length },
            ].map((item) => (
              <div key={item.label} className="text-center p-4 rounded-xl"
                style={{ background: "rgba(109,93,246,0.05)", border: "1px solid rgba(109,93,246,0.1)" }}>
                <div className="text-xl font-black mb-1" style={{ color: "#E8EAF6" }}>{item.value}</div>
                <div className="text-xs" style={{ color: "#6B7BA4" }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Email preview */}
        {preview && (
          <div className="px-8 py-6 border-b" style={{ borderColor: "rgba(109,93,246,0.15)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold" style={{ color: "#E8EAF6" }}>Email Preview</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing(!editing)}
                  className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg"
                  style={{ background: "rgba(109,93,246,0.1)", color: "#8B7CFF" }}>
                  <Edit3 className="w-3.5 h-3.5" /> {editing ? "Preview" : "Edit Template"}
                </button>
                <div className="flex gap-1">
                  {emails.slice(0, 5).map((_, i) => (
                    <button key={i} onClick={() => setPreviewIdx(i)}
                      className="w-6 h-6 rounded-full text-xs font-medium flex items-center justify-center"
                      style={{
                        background: previewIdx === i ? "#6D5DF6" : "rgba(109,93,246,0.15)",
                        color: previewIdx === i ? "white" : "#6B7BA4",
                      }}>
                      {i + 1}
                    </button>
                  ))}
                  {emails.length > 5 && <span className="text-xs self-center" style={{ color: "#6B7BA4" }}>+{emails.length - 5}</span>}
                </div>
              </div>
            </div>

            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "#E8EAF6" }}>Subject Template</label>
                  <input type="text" value={subjectTemplate}
                    onChange={(e) => setSubjectTemplate(e.target.value)}
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "#E8EAF6" }}>Body Template</label>
                  <textarea value={bodyTemplate}
                    onChange={(e) => setBodyTemplate(e.target.value)}
                    rows={8} className="input-field resize-none" />
                </div>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden"
                style={{ background: "rgba(11,16,32,0.6)", border: "1px solid rgba(109,93,246,0.15)" }}>
                <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(109,93,246,0.1)" }}>
                  <div className="flex gap-4 text-sm">
                    <span style={{ color: "#6B7BA4" }}>To:</span>
                    <span style={{ color: "#E8EAF6" }}>{preview.name} &lt;{preview.email}&gt;</span>
                  </div>
                  <div className="flex gap-4 text-sm mt-1">
                    <span style={{ color: "#6B7BA4" }}>Subject:</span>
                    <span style={{ color: "#E8EAF6" }}>{preview.subject}</span>
                  </div>
                </div>
                <div className="px-4 py-4">
                  <pre className="text-sm whitespace-pre-wrap font-sans" style={{ color: "#E8EAF6" }}>
                    {preview.body}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="px-8 py-6 flex gap-4">
          <button onClick={onCancel} className="btn-ghost flex items-center gap-2 flex-1 justify-center py-3">
            <X className="w-4 h-4" /> Cancel
          </button>
          <button
            id="approve-send-btn"
            onClick={async () => {
              setApproving(true);
              await onApprove(subjectTemplate, bodyTemplate);
              setApproving(false);
            }}
            disabled={approving}
            className="btn-primary flex items-center gap-2 flex-1 justify-center py-3"
          >
            {approving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <><Send className="w-4 h-4" /> Send {emails.length} Emails</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LivePipelinePage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.id as string;

  const [data, setData] = useState<PipelineStatus | null>(null);
  const [showApproval, setShowApproval] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/pipeline/${runId}/status`);
      if (res.ok) {
        const d: PipelineStatus = await res.json();
        setData(d);
        if (d.status === "PENDING_APPROVAL" && !showApproval) {
          setShowApproval(true);
        }
      }
    } catch {
      // silent
    }
  }, [runId, showApproval]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(() => {
      if (data?.status === "RUNNING" || data?.status === "PENDING" || !data) {
        fetchStatus();
      }
    }, 2000);
    return () => clearInterval(id);
  }, [fetchStatus, data?.status]);

  const handleApprove = async (subjectTemplate: string, bodyTemplate: string) => {
    const res = await fetch(`/api/pipeline/${runId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectTemplate, bodyTemplate }),
    });
    const result = await res.json();
    if (res.ok) {
      setShowApproval(false);
      setSendResult({ sent: result.sentCount, failed: result.failedCount });
      fetchStatus();
    }
  };

  if (!data) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" style={{ color: "#6D5DF6" }} />
          <p style={{ color: "#6B7BA4" }}>Loading pipeline...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl">
      {showApproval && data.campaign && (
        <ApprovalCheckpoint
          data={data}
          onApprove={handleApprove}
          onCancel={() => setShowApproval(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(109,93,246,0.15)" }}>
              <Globe className="w-5 h-5" style={{ color: "#6D5DF6" }} />
            </div>
            <h1 className="text-3xl font-bold" style={{ color: "#E8EAF6" }}>{data.seedDomain}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: "#6B7BA4" }}>Run ID: {data.id.slice(0, 8)}...</span>
            <span className={`badge ${
              data.status === "COMPLETED" ? "badge-success" :
              data.status === "RUNNING" ? "badge-warning" :
              data.status === "PENDING_APPROVAL" ? "badge-info" :
              data.status === "FAILED" ? "badge-error" : "badge-muted"
            }`}>
              {data.status === "RUNNING" && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
              {data.status.replace(/_/g, " ")}
            </span>
          </div>
        </div>

        {data.status === "PENDING_APPROVAL" && (
          <button
            onClick={() => setShowApproval(true)}
            className="btn-primary flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            Review & Approve
          </button>
        )}
      </div>

      {/* Send result banner */}
      {sendResult && (
        <div className="mb-6 px-6 py-4 rounded-2xl flex items-center gap-4"
          style={{ background: "rgba(0,200,150,0.1)", border: "1px solid rgba(0,200,150,0.3)" }}>
          <CheckCircle className="w-6 h-6" style={{ color: "#00C896" }} />
          <div>
            <p className="font-semibold" style={{ color: "#00C896" }}>Campaign Sent Successfully!</p>
            <p className="text-sm" style={{ color: "#6B7BA4" }}>
              {sendResult.sent} emails sent{sendResult.failed > 0 ? `, ${sendResult.failed} failed` : ""}
            </p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Stages — left column */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "#6B7BA4" }}>
            Pipeline Stages
          </h2>
          {STAGES.map((stage) => (
            <StageCard key={stage.num} stage={stage} currentStage={data.currentStage} status={data.status} />
          ))}
        </div>

        {/* Live data — right column */}
        <div className="lg:col-span-3 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Companies Found", value: data.stats.companiesFound, color: "#6D5DF6" },
              { label: "Contacts Found", value: data.stats.contactsFound, color: "#8B7CFF" },
              { label: "Verified Emails", value: data.stats.verifiedEmails, color: "#00C896" },
              { label: "Emails Ready", value: data.stats.emailsReady, color: "#FFB547" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-4"
                style={{ background: "rgba(18,25,43,0.7)", border: "1px solid rgba(109,93,246,0.12)" }}>
                <div className="text-3xl font-black mb-1" style={{ color: s.color }}>
                  {s.value ?? 0}
                </div>
                <div className="text-xs" style={{ color: "#6B7BA4" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Live companies */}
          {data.companies.length > 0 && (
            <div className="rounded-2xl overflow-hidden"
              style={{ background: "rgba(18,25,43,0.7)", border: "1px solid rgba(109,93,246,0.12)" }}>
              <div className="px-4 py-3 border-b flex items-center gap-2"
                style={{ borderColor: "rgba(109,93,246,0.1)" }}>
                <Search className="w-4 h-4" style={{ color: "#6D5DF6" }} />
                <h3 className="text-sm font-semibold" style={{ color: "#E8EAF6" }}>
                  Lookalike Companies ({data.companies.length})
                </h3>
              </div>
              <div className="divide-y" style={{ borderColor: "rgba(109,93,246,0.08)" }}>
                {data.companies.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(109,93,246,0.1)" }}>
                      <Globe className="w-4 h-4" style={{ color: "#6D5DF6" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate" style={{ color: "#E8EAF6" }}>{c.name}</div>
                      <div className="text-xs" style={{ color: "#6B7BA4" }}>{c.domain}</div>
                    </div>
                    {c.industry && (
                      <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: "rgba(109,93,246,0.08)", color: "#6B7BA4" }}>
                        {c.industry}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live contacts */}
          {data.contacts.length > 0 && (
            <div className="rounded-2xl overflow-hidden"
              style={{ background: "rgba(18,25,43,0.7)", border: "1px solid rgba(109,93,246,0.12)" }}>
              <div className="px-4 py-3 border-b flex items-center gap-2"
                style={{ borderColor: "rgba(109,93,246,0.1)" }}>
                <Users className="w-4 h-4" style={{ color: "#8B7CFF" }} />
                <h3 className="text-sm font-semibold" style={{ color: "#E8EAF6" }}>
                  Decision Makers ({data.contacts.length})
                </h3>
              </div>
              <div className="divide-y" style={{ borderColor: "rgba(109,93,246,0.08)" }}>
                {data.contacts.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                      style={{ background: "rgba(139,124,255,0.15)", color: "#8B7CFF" }}>
                      {c.name?.charAt(0) ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate" style={{ color: "#E8EAF6" }}>{c.name}</div>
                      <div className="text-xs" style={{ color: "#6B7BA4" }}>{c.title}</div>
                    </div>
                    {c.email && (
                      <span className="badge badge-success text-xs flex-shrink-0">✓ Verified</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending approval prompt */}
          {data.status === "PENDING_APPROVAL" && !sendResult && (
            <div className="rounded-2xl p-6 text-center"
              style={{ background: "linear-gradient(135deg, rgba(109,93,246,0.1), rgba(255,181,71,0.05))", border: "1px solid rgba(255,181,71,0.3)" }}>
              <Clock className="w-10 h-10 mx-auto mb-3" style={{ color: "#FFB547" }} />
              <h3 className="font-bold mb-2" style={{ color: "#E8EAF6" }}>Ready for Review</h3>
              <p className="text-sm mb-4" style={{ color: "#6B7BA4" }}>
                Your pipeline is complete. Review and approve the campaign to send emails.
              </p>
              <button
                onClick={() => setShowApproval(true)}
                className="btn-primary flex items-center gap-2 mx-auto"
              >
                <CheckCircle className="w-4 h-4" />
                Review Campaign
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {data.status === "COMPLETED" && (
            <div className="rounded-2xl p-6 text-center"
              style={{ background: "rgba(0,200,150,0.05)", border: "1px solid rgba(0,200,150,0.3)" }}>
              <CheckCircle className="w-10 h-10 mx-auto mb-3" style={{ color: "#00C896" }} />
              <h3 className="font-bold mb-2" style={{ color: "#E8EAF6" }}>Pipeline Complete</h3>
              <p className="text-sm" style={{ color: "#6B7BA4" }}>
                View detailed results in the Reports section.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
