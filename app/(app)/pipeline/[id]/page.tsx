"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Search, Users, Shield, Mail, CheckCircle, Clock,
  AlertCircle, Loader2, Send, X, Globe, ArrowRight, Edit3, Check
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

import dynamic from 'next/dynamic';

const ApprovalCheckpoint = dynamic(() => Promise.resolve(({ data, onApprove, onCancel }: {
  data: PipelineStatus;
  onApprove: (subject: string, body: string) => void;
  onCancel: () => void;
}) => {
  const [subjectTemplate, setSubjectTemplate] = useState(data.campaign?.subjectTemplate ?? "");
  const [bodyTemplate, setBodyTemplate] = useState(data.campaign?.bodyTemplate ?? "");
  const [editing, setEditing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);

  const emails = data.campaign?.emailsJson ?? [];
  const preview = emails[previewIdx];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[var(--brand-surface)] border border-[var(--brand-primary)] rounded-lg shadow-2xl"
      >
        <div className="px-8 py-6 border-b border-[var(--brand-border)]">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-6 h-6 text-[var(--brand-warning)]" />
            <h2 className="text-2xl font-bold tracking-tight text-[var(--brand-text)] uppercase text-editorial">Authorization Required</h2>
          </div>
          <p className="text-[var(--brand-muted)] font-mono text-sm uppercase">
            Payload ready for deployment. Manual sign-off required.
          </p>
        </div>

        {preview && (
          <div className="px-8 py-6 border-b border-[var(--brand-border)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-editorial uppercase tracking-wider text-sm text-[var(--brand-text)]">Payload Inspection</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing(!editing)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-[var(--brand-surface-2)] text-[var(--brand-text)] hover:text-[var(--brand-primary)] uppercase tracking-wide font-medium transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" /> {editing ? "Preview" : "Edit Config"}
                </button>
              </div>
            </div>

            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-mono mb-2 text-[var(--brand-muted)] uppercase">Subject Parameter</label>
                  <input type="text" value={subjectTemplate}
                    onChange={(e) => setSubjectTemplate(e.target.value)}
                    className="input-standard font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-mono mb-2 text-[var(--brand-muted)] uppercase">Body Parameter</label>
                  <textarea value={bodyTemplate}
                    onChange={(e) => setBodyTemplate(e.target.value)}
                    rows={8} className="input-standard font-mono resize-none" />
                </div>
              </div>
            ) : (
              <div className="rounded border border-[var(--brand-border)] bg-[#000] overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--brand-border)] bg-[var(--brand-surface-2)]">
                  <div className="flex gap-4 text-sm font-mono">
                    <span className="text-[var(--brand-muted)] uppercase">Target:</span>
                    <span className="text-[var(--brand-primary)]">{preview.name} &lt;{preview.email}&gt;</span>
                  </div>
                  <div className="flex gap-4 text-sm mt-1 font-mono">
                    <span className="text-[var(--brand-muted)] uppercase">Subject:</span>
                    <span className="text-[var(--brand-text)]">{preview.subject}</span>
                  </div>
                </div>
                <div className="px-4 py-4">
                  <pre className="text-sm whitespace-pre-wrap font-mono text-[var(--brand-muted)] leading-relaxed">
                    {preview.body}
                  </pre>
                </div>
              </div>
            )}
            
            {!editing && emails.length > 1 && (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {emails.slice(0, 10).map((_, i) => (
                  <button key={i} onClick={() => setPreviewIdx(i)}
                    className={`w-8 h-8 flex-shrink-0 rounded flex items-center justify-center font-mono text-xs transition-colors ${previewIdx === i ? 'bg-[var(--brand-primary)] text-black' : 'bg-[var(--brand-surface-2)] text-[var(--brand-muted)] hover:text-white'}`}>
                    0{i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-8 py-6 flex gap-4 bg-[var(--brand-bg)]">
          <button onClick={onCancel} className="btn-ghost flex-1 py-3 uppercase tracking-widest text-xs font-bold">
            Abort
          </button>
          <button
            onClick={async () => {
              setApproving(true);
              await onApprove(subjectTemplate, bodyTemplate);
              setApproving(false);
            }}
            disabled={approving}
            className="btn-primary flex-1 py-3 uppercase tracking-widest text-xs font-bold"
          >
            {approving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <><Send className="w-4 h-4" /> Authorize Launch ({emails.length})</>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}), { ssr: false, loading: () => null });

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function MissionView() {
  const params = useParams();
  const runId = params.id as string;

  const [showApproval, setShowApproval] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);

  const { data, mutate } = useSWR<PipelineStatus>(
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
      }
    }
  );

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
      mutate();
    }
  };

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
            Mission ID <span className="text-[var(--brand-muted)]">{data.id.split('-')[0]}</span>
          </h2>
          <h1 className="text-6xl md:text-7xl font-bold tracking-tighter text-editorial uppercase leading-none">
            {data.seedDomain.split('.')[0]}
            <span className="text-[var(--brand-muted)] text-3xl">.{data.seedDomain.split('.').slice(1).join('.')}</span>
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[var(--brand-muted)] font-mono text-[10px] uppercase mb-1">Status</span>
            <span className={`status-badge ${
              isComplete ? "status-completed" :
              data.status === "RUNNING" ? "status-running" :
              data.status === "PENDING_APPROVAL" ? "status-running" :
              isFailed ? "status-failed" : "status-pending"
            }`}>
              {data.status === "RUNNING" && <div className="w-1.5 h-1.5 bg-current rounded-full animate-ping mr-1" />}
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
            // logic for active/done
            // if currentStage is 1 (Discovery), then stage 0 (Domain) is done, stage 1 is active.
            // if currentStage is 4 (Outreach), then stages 0,1,2,3 are done.
            let state: "pending" | "active" | "done" | "error" = "pending";
            if (isFailed && data.currentStage === stage.num) state = "error";
            else if (isComplete || data.currentStage > stage.num) state = "done";
            else if (data.currentStage === stage.num && data.status !== "PENDING_APPROVAL") state = "active";
            else if (data.status === "PENDING_APPROVAL" && stage.num === 4) state = "active";

            return (
              <div key={stage.num} className="flex flex-col items-center relative w-32">
                {/* Connecting Line Animation (Rendered on previous segments) */}
                {i > 0 && (state === "active" || state === "done") && (
                  <motion.div 
                    className="absolute h-px bg-[var(--brand-primary)] top-6 right-1/2 w-full -z-10"
                    initial={{ scaleX: 0, transformOrigin: "left" }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.8 }}
                  />
                )}

                {/* Node */}
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
                
                {/* Labels */}
                <div className="text-center">
                  <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${state === "active" || state === "done" ? "text-[var(--brand-text)]" : "text-[var(--brand-muted)]"}`}>
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
                <p className="text-[var(--brand-text)] font-mono text-sm">Payload successfully delivered to {sendResult.sent} targets.</p>
                {sendResult.failed > 0 && <p className="text-[var(--brand-error)] font-mono text-sm mt-2">{sendResult.failed} deliveries failed.</p>}
              </div>
            </motion.div>
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
                    <span className="text-[var(--brand-primary)] font-mono text-xs cursor-pointer hover:underline">+ {data.contacts.length - 10} additional targets hidden</span>
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
