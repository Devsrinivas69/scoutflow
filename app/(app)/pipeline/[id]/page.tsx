"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Search, Users, Shield, Mail, CheckCircle, Clock,
  AlertCircle, Loader2, Send, Globe, Check, ExternalLink,
  AlertTriangle, Zap, Info, RefreshCw,
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
    apolloFallbackActivated?: boolean;
    apolloUnavailable?: boolean;
    prospeoRateLimited?: boolean;
    providerWarnings?: Array<{ provider: string; status: string; reason: string }>;
  };
  companies: Array<{ name: string; domain: string; industry?: string; country?: string }>;
  contacts: Array<{
    id: string;
    name: string;
    firstName: string;
    lastName: string | null;
    title: string;
    email: string | null;
    patternUsed?: string | null;
    confidenceScore?: string | null;
    reasoning?: string | null;
    companyName?: string;
    companyDomain?: string;
    linkedinUrl?: string | null;
    qualityScore?: number;
    status?: string;
    reason?: string | null;
    duplicateStatus?: string;
    emailSource?: string;
    provider?: string;
    failoverReason?: string | null;
  }>;
  campaign: {
    id: string;
    status: string;
    subjectTemplate: string;
    bodyTemplate: string;
    emailsJson: Array<{ email: string; name: string; subject: string; body: string }>;
    sentCount?: number;
    failedCount?: number;
    errorMessage?: string | null;
  } | null;
  discoveryAudits?: Array<{
    domain: string;
    providerUsed: string;
    status: string;
    fallbackActivated: boolean;
    failoverReason: string | null;
    rawContacts: number;
    contactsParsed: number;
    contactsSaved: number;
    contactsFiltered: number;
    contactsDisplayed: number;
    emailsReturned: number;
    emailsParsed: number;
    emailsSaved: number;
    emailsDisplayed: number;
    rejectionReasons: Record<string, number>;
    requestJson?: any;
    responseJson?: any;
    errorMessage?: string;
  }>;
  emailDisappearedAudits?: Array<{
    fullName: string;
    email: string;
    file: string;
    function: string;
    filter: string;
    rejectionReason: string;
  }>;
}

function diagnoseResendError(errorMessage?: string | null): {
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  showVerifyLink: boolean;
} {
  if (!errorMessage) {
    return {
      title: "Unknown Delivery Failure",
      description: "An unknown error occurred while sending emails via Resend.",
      badge: "Unknown Error",
      badgeColor: "error",
      showVerifyLink: false,
    };
  }

  const errLower = errorMessage.toLowerCase();

  if (errLower.includes("validation_error") || errLower.includes("not verified") || errLower.includes("unverified") || errLower.includes("sender") || errLower.includes("from")) {
    return {
      title: "Sender / Domain Unverified",
      description: "Resend rejected the sender email. Ensure that the domain of your RESEND_FROM_EMAIL is registered and verified in the Resend Dashboard under 'Domains' with valid SPF, DKIM, and DMARC records.",
      badge: "Unverified Domain",
      badgeColor: "error",
      showVerifyLink: true,
    };
  }

  if (errLower.includes("unauthorized") || errLower.includes("api-key") || errLower.includes("api key") || errLower.includes("forbidden") || errLower.includes("api_key") || errLower.includes("restricted")) {
    return {
      title: "Authentication Error",
      description: "The configured RESEND_API_KEY is invalid, expired, or unauthorized. Please verify your API key under Resend -> API Keys.",
      badge: "Authentication Error",
      badgeColor: "error",
      showVerifyLink: false,
    };
  }

  if (errLower.includes("quota") || errLower.includes("limit") || errLower.includes("exceeded") || errLower.includes("rate")) {
    return {
      title: "Sending Limit Exceeded",
      description: "Resend rate limits or daily quotas have been exceeded. Please check your Resend plan details in the Resend dashboard.",
      badge: "Limit Exceeded",
      badgeColor: "warning",
      showVerifyLink: false,
    };
  }

  if (errLower.includes("recipient") || errLower.includes("to") || errLower.includes("invalid_recipient")) {
    return {
      title: "Invalid Recipient",
      description: "Resend rejected the recipient email address. The recipient list may contain invalid or syntactically incorrect emails.",
      badge: "Invalid Recipient",
      badgeColor: "warning",
      showVerifyLink: false,
    };
  }

  if (errLower.includes("payload") || errLower.includes("parameter") || errLower.includes("validation")) {
    return {
      title: "Invalid Payload",
      description: "The constructed payload does not meet Resend's API requirements. Check Resend API docs or logs for details.",
      badge: "Invalid Payload",
      badgeColor: "error",
      showVerifyLink: false,
    };
  }

  return {
    title: "Resend API Error",
    description: errorMessage,
    badge: "API Failure",
    badgeColor: "error",
    showVerifyLink: false,
  };
}

const STAGES = [
  { num: 0, icon: Globe, label: "Domain", desc: "Target Acquired" },
  { num: 1, icon: Search, label: "Discovery", desc: "Ocean.io" },
  { num: 2, icon: Users, label: "Contacts", desc: "Prospeo" },
  { num: 3, icon: Shield, label: "EazyReach", desc: "Email Discovery" },
  { num: 4, icon: Mail, label: "Outreach", desc: "Resend" },
];

export default function MissionView() {
  const params = useParams();
  const runId = params.id as string;

  const [showApproval, setShowApproval] = useState(false);
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const { data, error, mutate } = useSWR<PipelineStatus>(
    `/api/pipeline/${runId}/status`,
    fetcher,
    {
      refreshInterval: (currentData) => {
        if (!currentData) return 2000;
        return ["PENDING", "RUNNING", "APPROVED", "SENDING"].includes(currentData.status) ? 2000 : 0;
      },
      onSuccess: (d) => {
        if (d.status === "PENDING_APPROVAL" && d.campaign?.status === "PENDING_APPROVAL" && !showApproval) {
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
      if (res.ok) {
        setShowApproval(false);
        mutate();
      }
    } catch (err) {
      console.error("[Approve] Error:", err);
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const res = await fetch(`/api/pipeline/${runId}/retry`, { method: "POST" });
      if (res.ok) {
        await mutate();
        setShowApproval(true);
      } else {
        const body = await res.json();
        console.error("[Retry] Failed:", body.error);
      }
    } catch (err) {
      console.error("[Retry] Error:", err);
    } finally {
      setIsRetrying(false);
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

  const isComplete = data.status === "COMPLETED" || data.status === "COMPLETED_WITH_WARNINGS";
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
                data.status === "COMPLETED" ? "status-completed" :
                data.status === "COMPLETED_WITH_WARNINGS" ? "status-warning" :
                data.status === "RUNNING" ? "status-running" :
                data.status === "PENDING_APPROVAL" ? "status-running" :
                data.status === "APPROVED" ? "status-running" :
                data.status === "SENDING" ? "status-running" :
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
      <div className="mb-24 relative px-4 overflow-x-auto scrollbar-hide">
        <div className="absolute top-6 left-0 right-0 h-px bg-[var(--brand-border)] z-0 min-w-[640px]" />

        <div className="flex justify-between relative z-10 min-w-[640px] md:min-w-0">
          {STAGES.map((stage, i) => {
            const Icon = stage.icon;
            let state: "pending" | "active" | "done" | "error" = "pending";
            if (isFailed && data.currentStage === stage.num) state = "error";
            else if (isComplete || data.currentStage > stage.num) state = "done";
            else if (data.currentStage === stage.num && data.status !== "PENDING_APPROVAL") state = "active";
            else if (data.status === "PENDING_APPROVAL" && stage.num === 4) state = "active";
            // COMPLETED_WITH_WARNINGS means outreach ran — mark stage 4 as done
            if (data.status === "COMPLETED_WITH_WARNINGS" && stage.num === 4) state = "done";

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
            <div className="metric-label">Resolved Comms</div>
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
          {/* ── Campaign Sending Status ─────────────────────────────── */}
          {data.campaign && data.campaign.status === "SENDING" && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[var(--brand-primary)]/30 bg-[rgba(109,93,246,0.06)] text-[var(--brand-primary)] text-xs font-mono"
            >
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span className="uppercase tracking-wider font-bold">Sending outreach — {data.campaign.sentCount ?? 0} delivered so far…</span>
            </motion.div>
          )}

          {data.campaign && data.campaign.status === "SENT" && (data.campaign.sentCount ?? 0) > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[var(--brand-success)]/30 bg-[rgba(0,200,150,0.06)] text-[var(--brand-success)] text-xs font-mono"
            >
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span className="uppercase tracking-wider font-bold">
                {data.campaign.sentCount} email{(data.campaign.sentCount ?? 0) !== 1 ? "s" : ""} delivered
                {(data.campaign.failedCount ?? 0) > 0 && <span className="text-[var(--brand-error)] ml-2">· {data.campaign.failedCount} failed</span>}
              </span>
            </motion.div>
          )}

          {/* ── Delivery Failed — Beautiful Premium Alert ───────────── */}
          {data.campaign && (data.campaign.status === "FAILED" || ((data.campaign.failedCount ?? 0) > 0 && (data.campaign.sentCount ?? 0) === 0)) && (() => {
            const diagnosis = diagnoseResendError(data.campaign.errorMessage);
            const badgeColorClasses = 
              diagnosis.badgeColor === "error" 
                ? "bg-[rgba(239,68,68,0.1)] border-[var(--brand-error)]/25 text-[var(--brand-error)]" 
                : "bg-[rgba(255,181,71,0.1)] border-[var(--brand-warning)]/25 text-[var(--brand-warning)]";
            return (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                className="rounded-xl border border-[var(--brand-error)]/40 bg-gradient-to-br from-[rgba(239,68,68,0.08)] to-[rgba(239,68,68,0.03)] overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--brand-error)]/20 bg-[rgba(239,68,68,0.06)]">
                  <div className="w-8 h-8 rounded-lg bg-[rgba(239,68,68,0.15)] border border-[var(--brand-error)]/30 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4 h-4 text-[var(--brand-error)]" />
                  </div>
                  <div>
                    <p className="text-[var(--brand-error)] font-bold text-sm uppercase tracking-widest">Delivery Failed</p>
                    <p className="text-[var(--brand-muted)] text-[11px] font-mono mt-0.5">Emails were rejected by the outreach provider.</p>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  {/* Diagnosis */}
                  <div className="rounded-lg border border-white/5 bg-black/25 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="w-3.5 h-3.5 text-[var(--brand-warning)] shrink-0" />
                      <span className="text-[var(--brand-warning)] font-mono text-[10px] uppercase tracking-widest font-bold">Diagnosed Issue:</span>
                      <span className={`inline-flex px-2 py-0.5 rounded border font-mono text-[9px] uppercase font-bold ${badgeColorClasses}`}>
                        {diagnosis.badge}
                      </span>
                    </div>
                    <p className="text-white font-bold text-sm leading-snug mb-1">{diagnosis.title}</p>
                    <p className="text-[var(--brand-muted)] text-xs leading-relaxed mb-3">
                      {diagnosis.description}
                    </p>

                    {/* Resend Diagnostic Details */}
                    <div className="mt-4 pt-3 border-t border-white/5 grid grid-cols-2 gap-y-2 text-[11px] font-mono text-[var(--brand-muted)]">
                      <div>Email Provider:</div>
                      <div className="text-white font-semibold text-right">Resend</div>
                      
                      <div>Delivery Status:</div>
                      <div className="text-[var(--brand-error)] font-semibold text-right">FAILED</div>
                      
                      {data.campaign.id && (
                        <>
                          <div>Campaign ID:</div>
                          <div className="text-white text-right font-semibold truncate max-w-[150px] ml-auto" title={data.campaign.id}>{data.campaign.id}</div>
                        </>
                      )}
                      
                      {diagnosis.badge && (
                        <>
                          <div>Failure Reason:</div>
                          <div className="text-white text-right font-semibold">{diagnosis.badge}</div>
                        </>
                      )}
                    </div>

                    {diagnosis.showVerifyLink && (
                      <div className="pt-3 mt-3 border-t border-white/5 space-y-3">
                        <div className="text-[var(--brand-muted)] text-[11px] leading-relaxed">
                          Your sender address:{" "}
                          <code className="bg-black/40 px-1.5 py-0.5 rounded border border-white/10 text-[var(--brand-warning)] font-mono">
                            {process.env.NEXT_PUBLIC_RESEND_FROM_EMAIL ?? "contact@scout-flow.app"}
                          </code>
                        </div>
                        <a
                          href="https://resend.com/domains"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--brand-warning)] text-black text-[11px] font-bold uppercase tracking-wide hover:opacity-90 transition-opacity"
                        >
                          Verify Domain on Resend <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Error detail if available */}
                  {data.campaign.errorMessage && (
                    <div className="rounded-lg border border-white/5 bg-black/30 p-3">
                      <p className="text-[var(--brand-muted)] text-[10px] uppercase tracking-widest font-mono mb-1.5">Raw API Error Message</p>
                      <p className="text-[var(--brand-error)]/80 font-mono text-[11px] leading-relaxed break-all">
                        {data.campaign.errorMessage}
                      </p>
                    </div>
                  )}

                {/* Checklist */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {[
                      { label: "API Key valid", hint: "Check Resend → API Keys" },
                      { label: "SPF / DKIM set", hint: "Check DNS for scout-flow.app" },
                      { label: "Resend limits", hint: "Check limits in dashboard" },
                    ].map((item) => (
                      <div key={item.label} className="flex items-start gap-2 p-2.5 rounded border border-white/5 bg-white/[0.02]">
                        <Info className="w-3 h-3 text-[var(--brand-muted)] mt-0.5 shrink-0" />
                        <div>
                          <p className="text-white text-[10px] font-semibold">{item.label}</p>
                          <p className="text-[var(--brand-muted)] text-[9px] font-mono mt-0.5">{item.hint}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Retry button */}
                  <div className="pt-2">
                    <button
                      id="retry-delivery-btn"
                      onClick={handleRetry}
                      disabled={isRetrying}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-black font-bold text-xs uppercase tracking-wide hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRetrying ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      {isRetrying ? "Resetting…" : "Retry Delivery"}
                    </button>
                    <p className="text-[var(--brand-muted)] text-[10px] font-mono mt-1.5">
                      Resets campaign to approval stage — no pipeline re-run needed.
                    </p>
                  </div>

              </div>
            </motion.div>
          )})()}

          {/* ── Pipeline Hard Failure ──────────────────────────────── */}
          {isFailed && data.errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-[var(--brand-error)]/40 bg-gradient-to-br from-[rgba(239,68,68,0.08)] to-transparent overflow-hidden"
            >
              <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--brand-error)]/20">
                <AlertCircle className="w-4 h-4 text-[var(--brand-error)] shrink-0" />
                <span className="font-mono text-xs uppercase text-[var(--brand-error)] font-bold tracking-widest">Pipeline Failed</span>
              </div>
              <div className="p-5">
                <p className="text-[var(--brand-muted)] font-mono text-sm leading-relaxed">{data.errorMessage}</p>
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
                {data.contacts.slice(0, 10).map((c, i) => {
                  const contactIdKey = c.id || i.toString();
                  const isExpanded = expandedContactId === contactIdKey;
                  return (
                    <div 
                      key={contactIdKey} 
                      className="p-4 hover:bg-[var(--brand-surface-2)] transition-colors cursor-pointer"
                      onClick={() => setExpandedContactId(isExpanded ? null : contactIdKey)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[var(--brand-text)] font-medium text-sm flex items-center gap-2">
                            {c.name}
                            <span className="text-[9px] font-mono text-[var(--brand-muted)] border border-[var(--brand-border)] px-1 rounded uppercase tracking-wide">
                              Click to inspect
                            </span>
                          </div>
                          <div className="text-[var(--brand-muted)] text-xs mt-1 flex flex-wrap items-center gap-1.5">
                            <span>{c.title}</span>
                            {c.email && (
                              <>
                                <span className="text-[var(--brand-border)] font-normal text-[10px]">•</span>
                                <span className={`font-mono text-[11px] ${c.email.startsWith("No email available") ? "text-[var(--brand-error)]" : "text-[var(--brand-success)] font-medium bg-[rgba(34,197,94,0.03)] px-1.5 py-0.5 rounded border border-[rgba(34,197,94,0.1)]"}`}>
                                  {c.email}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {c.status === "REJECTED" ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono text-[10px] text-[var(--brand-error)] border border-[var(--brand-error)] px-2 py-0.5 rounded">REJECTED</span>
                            {c.qualityScore !== undefined && (
                              <span className="font-mono text-[9px] text-[var(--brand-muted)] uppercase">
                                Score: {c.qualityScore}/100
                              </span>
                            )}
                          </div>
                        ) : c.email && !c.email.startsWith("No email available") ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono text-[10px] text-[var(--brand-success)] border border-[var(--brand-success)] px-2 py-0.5 rounded bg-[rgba(34,197,94,0.05)] font-bold">REAL EMAIL</span>
                            <span className="font-mono text-[9px] text-[var(--brand-muted)] uppercase">
                              {c.provider === "apollo-fallback" ? "Apollo Fallback" : "Prospeo"}
                            </span>
                          </div>
                        ) : data.status === "COMPLETED" || data.status === "COMPLETED_WITH_WARNINGS" || data.status === "PENDING_APPROVAL" || data.currentStage > 3 ? (
                          <span className="font-mono text-[10px] text-[var(--brand-error)] border border-[var(--brand-error)] px-2 py-1 rounded bg-[rgba(239,68,68,0.05)] uppercase">
                            {c.email || "No email available"}
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] text-[var(--brand-muted)] border border-[var(--brand-border)] px-2 py-1 rounded">PENDING</span>
                        )}
                      </div>

                      {isExpanded && (
                        <div 
                          className="mt-4 p-4 border border-[var(--brand-border)] bg-[var(--brand-bg)] rounded text-xs font-mono space-y-3 text-[var(--brand-muted)]"
                          onClick={(e) => e.stopPropagation()} // Prevent toggling/collapsing on click inside panel
                        >
                          <div className="text-[var(--brand-primary)] uppercase tracking-wider font-bold text-[10px] flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] animate-pulse" />
                            Developer Diagnostics
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                            <div>
                              <span className="text-white block uppercase text-[9px] tracking-wider mb-0.5">Company:</span>
                              <span className="text-[var(--brand-text)]">{c.companyName || "N/A"}</span>
                            </div>
                            <div>
                              <span className="text-white block uppercase text-[9px] tracking-wider mb-0.5">Domain:</span>
                              <span className="text-[var(--brand-text)]">{c.companyDomain || "N/A"}</span>
                            </div>
                            <div>
                              <span className="text-white block uppercase text-[9px] tracking-wider mb-0.5">Contact Name:</span>
                              <span className="text-[var(--brand-text)]">{c.name}</span>
                            </div>
                            <div>
                              <span className="text-white block uppercase text-[9px] tracking-wider mb-0.5">Duplicate Status:</span>
                              <span className={`text-[var(--brand-text)] ${c.duplicateStatus === "DUPLICATE" ? "text-[var(--brand-error)] font-bold" : ""}`}>
                                {c.duplicateStatus || "ORIGINAL"}
                              </span>
                            </div>
                            <div>
                              <span className="text-white block uppercase text-[9px] tracking-wider mb-0.5">Contact Source:</span>
                              <span className={`text-[var(--brand-text)] uppercase font-semibold ${c.provider === "apollo-fallback" ? "text-[var(--brand-warning)]" : "text-[var(--brand-success)]"}`}>
                                {c.provider === "apollo-fallback" ? "Apollo Fallback" : "Prospeo"}
                              </span>
                            </div>
                            {c.failoverReason && (
                              <div>
                                <span className="text-white block uppercase text-[9px] tracking-wider mb-0.5">Failover Reason:</span>
                                <span className="text-[var(--brand-warning)]">{c.failoverReason}</span>
                              </div>
                            )}
                            <div>
                              <span className="text-white block uppercase text-[9px] tracking-wider mb-0.5">Quality Audit Score:</span>
                              {c.qualityScore !== undefined ? (
                                <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${c.qualityScore >= 80 ? "bg-[rgba(34,197,94,0.1)] text-[var(--brand-success)]" : c.qualityScore >= 60 ? "bg-[rgba(245,158,11,0.1)] text-[var(--brand-warning)]" : "bg-[rgba(239,68,68,0.1)] text-[var(--brand-error)]"}`}>
                                  {c.qualityScore}/100
                                </span>
                              ) : (
                                <span className="text-[var(--brand-text)]">N/A</span>
                              )}
                            </div>
                          </div>

                          {c.reason && (
                            <div className="pt-2">
                              <span className="text-white block uppercase text-[9px] tracking-wider mb-0.5">Contact Quality Decision Reason:</span>
                              <div className={`p-2.5 rounded border text-[10px] leading-relaxed ${c.status === "REJECTED" ? "text-[var(--brand-error)] bg-[rgba(239,68,68,0.05)] border-[rgba(239,68,68,0.2)]" : "text-[var(--brand-success)] bg-[rgba(34,197,94,0.05)] border-[rgba(34,197,94,0.2)]"}`}>
                                {c.reason}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[var(--brand-border)] text-[9px] uppercase tracking-wider font-semibold">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${c.email && !c.email.startsWith("No email available") ? "bg-[var(--brand-success)]" : "bg-[var(--brand-error)]"}`} />
                              DB Stored: {c.email && !c.email.startsWith("No email available") ? "YES" : "NO"}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${c.email && !c.email.startsWith("No email available") ? "bg-[var(--brand-success)]" : "bg-[var(--brand-error)]"}`} />
                              API Returned: {c.email && !c.email.startsWith("No email available") ? "YES" : "NO"}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-success)]" />
                              UI Rendered: YES
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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
