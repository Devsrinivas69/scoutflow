"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Search, Users, Shield, Mail, CheckCircle, Clock,
  AlertCircle, Loader2, Send, Globe, Check,
} from "lucide-react";
import { motion } from "framer-motion";
import useSWR from "swr";
import dynamic from "next/dynamic";

// Fetcher defined outside component so SWR deduplication works correctly
const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Properly imported from a separate file — next/dynamic requires import() not inline components
const ApprovalCheckpoint = dynamic(
  () => import("./ApprovalCheckpoint"),
  { ssr: false, loading: () => null }
);

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
  { num: 0, icon: Globe, label: "Domain", desc: "Target Acquired" },
  { num: 1, icon: Search, label: "Discovery", desc: "Ocean.io" },
  { num: 2, icon: Users, label: "Contacts", desc: "Prospeo" },
  { num: 3, icon: Shield, label: "Verification", desc: "Eazyreach" },
  { num: 4, icon: Mail, label: "Outreach", desc: "Brevo" },
];

export default function MissionView() {
  const params = useParams();
  const runId = params.id as string;

  const [showApproval, setShowApproval] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);

  const { data, error, mutate } = useSWR<PipelineStatus>(
    `/api/pipeline/${runId}/status`,
    fetcher,
    {
      refreshInterval: (currentData) => {
        if (!currentData) return 2000;
        return currentData.status === "RUNNING" || currentData.status === "PENDING" ? 2000 : 0;
      },
      onSuccess: (d) => {
        if (d.status === "PENDING_APPROVAL" && !showApproval && !sendResult) {
          setShowApproval(true);
        }
      },
    }
  );

  const handleApprove = async (subjectTemplate: string, bodyTemplate: string) => {
    try {
      const res = await fetch(`/api/pipeline/${runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectTemplate, bodyTemplate }),
      });
      const result = await res.json();
      if (res.ok) {
        setShowApproval(false);
        setSendResult({ sent: result.sentCount, failed: result.failedCount });
        mutate();
      }
    } catch (err) {
      console.error("[Approve] Error:", err);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center flex flex-col items-center gap-4">
          <AlertCircle className="w-10 h-10 text-[var(--brand-error)]" />
          <p className="text-[var(--brand-muted)] font-mono uppercase text-xs tracking-widest">
            Failed to load mission data.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center flex flex-col items-center">
          <div className="w-12 h-12 border-2 border-[var(--brand-primary)] border-t-transparent rounded-full animate-spin mb-6" />
          <p className="text-[var(--brand-muted)] font-mono uppercase text-xs tracking-widest">Establishing Uplink...</p>
        </div>
      </div>
    );
  }

  const isComplete = data.status === "COMPLETED";
  const isFailed = data.status === "FAILED";

  return (
    <div className="max-w-[1200px] mx-auto w-full">
      {showApproval && data.campaign && (
        <ApprovalCheckpoint
          data={data}
          onApprove={handleApprove}
          onCancel={() => setShowApproval(false)}
        />
      )}

      {/* Hero Header */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-16 gap-6">
        <div>
          <h2 className="text-[var(--brand-primary)] font-mono text-xs uppercase tracking-widest mb-2 flex items-center gap-2">
            Mission ID <span className="text-[var(--brand-muted)]">{data.id.split("-")[0]}</span>
          </h2>
          <h1 className="text-6xl md:text-7xl font-bold tracking-tighter text-editorial uppercase leading-none">
            {data.seedDomain.split(".")[0]}
            <span className="text-[var(--brand-muted)] text-3xl">
              .{data.seedDomain.split(".").slice(1).join(".")}
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[var(--brand-muted)] font-mono text-[10px] uppercase mb-1">Status</span>
            <span
              className={`status-badge ${
                isComplete ? "status-completed" :
                data.status === "RUNNING" ? "status-running" :
                data.status === "PENDING_APPROVAL" ? "status-running" :
                isFailed ? "status-failed" : "status-pending"
              }`}
            >
              {data.status === "RUNNING" && (
                <div className="w-1.5 h-1.5 bg-current rounded-full animate-ping mr-1" />
              )}
              {data.status.replace(/_/g, " ")}
            </span>
          </div>
          {data.status === "PENDING_APPROVAL" && (
            <button
              onClick={() => setShowApproval(true)}
              className="btn-primary"
            >
              <CheckCircle className="w-4 h-4" />
              Authorize
            </button>
          )}
        </div>
      </div>

      {/* Horizontal Pipeline Journey */}
      <div className="mb-24 relative px-4">
        <div className="absolute top-6 left-0 right-0 h-px bg-[var(--brand-border)] z-0" />

        <div className="flex justify-between relative z-10">
          {STAGES.map((stage, i) => {
            const Icon = stage.icon;
            let state: "pending" | "active" | "done" | "error" = "pending";
            if (isFailed && data.currentStage === stage.num) state = "error";
            else if (isComplete || data.currentStage > stage.num) state = "done";
            else if (data.currentStage === stage.num && data.status !== "PENDING_APPROVAL") state = "active";
            else if (data.status === "PENDING_APPROVAL" && stage.num === 4) state = "active";

            return (
              <div key={stage.num} className="flex flex-col items-center relative w-32">
                {i > 0 && (state === "active" || state === "done") && (
                  <motion.div
                    className="absolute h-px bg-[var(--brand-primary)] top-6 right-1/2 w-full -z-10"
                    initial={{ scaleX: 0, transformOrigin: "left" }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.8 }}
                  />
                )}

                <motion.div
                  className={`w-12 h-12 rounded flex items-center justify-center mb-4 transition-colors duration-500 ${
                    state === "active" ? "bg-[var(--brand-surface)] border-2 border-[var(--brand-primary)] text-[var(--brand-primary)]" :
                    state === "done" ? "bg-[var(--brand-primary)] border-2 border-[var(--brand-primary)] text-black" :
                    state === "error" ? "bg-[var(--brand-error)] border-2 border-[var(--brand-error)] text-black" :
                    "bg-[var(--brand-surface)] border border-[var(--brand-border)] text-[var(--brand-muted)]"
                  }`}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: state === "active" ? 1.1 : 1, opacity: 1 }}
                  transition={{ type: "spring", bounce: 0.5 }}
                >
                  {state === "done" ? <Check className="w-5 h-5" /> :
                   state === "active" ? <Loader2 className="w-5 h-5 animate-spin" /> :
                   <Icon className="w-5 h-5" />}
                </motion.div>

                <div className="text-center">
                  <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${
                    state === "active" || state === "done"
                      ? "text-[var(--brand-text)]"
                      : "text-[var(--brand-muted)]"
                  }`}>
                    {stage.label}
                  </div>
                  <div className="text-[10px] font-mono text-[var(--brand-muted)] uppercase">
                    {stage.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Results Editorial Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left Column: Big Insights */}
        <div className="lg:col-span-4 space-y-12">
          <div>
            <div className="metric-label">Lookalike Entities</div>
            <motion.div
              key={data.stats.companiesFound}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="metric-value text-[var(--brand-primary)]"
            >
              {data.stats.companiesFound}
            </motion.div>
          </div>

          <div>
            <div className="metric-label">Key Personnel</div>
            <motion.div
              key={data.stats.contactsFound}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="metric-value text-white"
            >
              {data.stats.contactsFound}
            </motion.div>
          </div>

          <div>
            <div className="metric-label">Verified Comms</div>
            <motion.div
              key={data.stats.verifiedEmails}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="metric-value text-[var(--brand-muted)]"
            >
              {data.stats.verifiedEmails}
            </motion.div>
          </div>
        </div>

        {/* Right Column: Feeds */}
        <div className="lg:col-span-8 space-y-8">
          {sendResult && (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="panel border-[var(--brand-success)] bg-[#000]">
              <div className="panel-header bg-[rgba(226,255,61,0.05)]">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-[var(--brand-success)]" />
                  <span className="font-mono text-sm uppercase text-[var(--brand-success)]">Mission Accomplished</span>
                </div>
              </div>
              <div className="p-6">
                <p className="text-[var(--brand-text)] font-mono text-sm">
                  Payload successfully delivered to {sendResult.sent} targets.
                </p>
                {sendResult.failed > 0 && (
                  <p className="text-[var(--brand-error)] font-mono text-sm mt-2">
                    {sendResult.failed} deliveries failed.
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {isFailed && data.errorMessage && (
            <div className="panel border-[var(--brand-error)]">
              <div className="panel-header">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-[var(--brand-error)]" />
                  <span className="font-mono text-xs uppercase text-[var(--brand-error)]">Pipeline Failed</span>
                </div>
              </div>
              <div className="p-6">
                <p className="text-[var(--brand-muted)] font-mono text-sm">{data.errorMessage}</p>
              </div>
            </div>
          )}

          {data.contacts.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <span className="font-mono text-xs uppercase tracking-widest text-[var(--brand-muted)]">Target Roster</span>
                <span className="text-[var(--brand-primary)] font-mono text-xs">{data.contacts.length} entries</span>
              </div>
              <div className="divide-y divide-[var(--brand-border)]">
                {data.contacts.slice(0, 10).map((c, i) => (
                  <div key={i} className="p-4 flex items-center justify-between hover:bg-[var(--brand-surface-2)] transition-colors">
                    <div>
                      <div className="text-[var(--brand-text)] font-medium text-sm">{c.name}</div>
                      <div className="text-[var(--brand-muted)] text-xs mt-1">{c.title}</div>
                    </div>
                    {c.email ? (
                      <span className="font-mono text-[10px] text-[var(--brand-success)] border border-[var(--brand-success)] px-2 py-1 rounded">VERIFIED</span>
                    ) : (
                      <span className="font-mono text-[10px] text-[var(--brand-muted)] border border-[var(--brand-border)] px-2 py-1 rounded">PENDING</span>
                    )}
                  </div>
                ))}
                {data.contacts.length > 10 && (
                  <div className="p-4 text-center">
                    <span className="text-[var(--brand-primary)] font-mono text-xs">
                      + {data.contacts.length - 10} additional targets hidden
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {data.companies.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <span className="font-mono text-xs uppercase tracking-widest text-[var(--brand-muted)]">Entity Discovered</span>
                <span className="text-white font-mono text-xs">{data.companies.length} orgs</span>
              </div>
              <div className="p-4 flex flex-wrap gap-2">
                {data.companies.slice(0, 15).map((c, i) => (
                  <span key={i} className="text-xs text-[var(--brand-muted)] border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-1.5 rounded hover:border-[var(--brand-primary)] transition-colors cursor-default">
                    {c.name}
                  </span>
                ))}
                {data.companies.length > 15 && (
                  <span className="text-xs text-[var(--brand-primary)] border border-[var(--brand-border)] bg-[var(--brand-surface-2)] px-3 py-1.5 rounded">
                    +{data.companies.length - 15} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
