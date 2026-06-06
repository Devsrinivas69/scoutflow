"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Zap, ArrowRight, CheckCircle, Search, Users, Shield, Mail } from "lucide-react";

const PIPELINE_STEPS = [
  { icon: Search, label: "Company Discovery", desc: "Ocean.io finds lookalike companies", api: "Ocean.io" },
  { icon: Users, label: "Decision Makers", desc: "Prospeo surfaces contacts", api: "Prospeo" },
  { icon: Shield, label: "Email Verification", desc: "Eazyreach verifies emails", api: "Eazyreach" },
  { icon: Mail, label: "Outreach Generation", desc: "Brevo sends campaigns", api: "Brevo" },
];

const EXAMPLE_DOMAINS = ["stripe.com", "notion.so", "vercel.com", "linear.app", "figma.com"];

export default function PipelinePage() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!domain.trim()) { setError("Please enter a company domain"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/pipeline/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "") }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to start pipeline");
      } else {
        router.push(`/pipeline/${data.runId}`);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2" style={{ color: "#E8EAF6" }}>New Pipeline Run</h1>
        <p style={{ color: "#6B7BA4" }}>
          Enter one company domain. ScoutFlow handles everything else automatically.
        </p>
      </div>

      {/* Main input card */}
      <div className="rounded-3xl p-8 mb-8"
        style={{
          background: "linear-gradient(135deg, rgba(109,93,246,0.08), rgba(18,25,43,0.9))",
          border: "1px solid rgba(109,93,246,0.3)",
          boxShadow: "0 0 60px rgba(109,93,246,0.1)",
        }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #6D5DF6, #8B7CFF)" }}>
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-lg" style={{ color: "#E8EAF6" }}>Launch Pipeline</h2>
            <p className="text-sm" style={{ color: "#6B7BA4" }}>Enter the seed domain to begin</p>
          </div>
        </div>

        <form onSubmit={handleLaunch}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2" style={{ color: "#E8EAF6" }}>
              Company Domain
            </label>
            <div className="relative">
              <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: "#6B7BA4" }} />
              <input
                id="pipeline-domain-input"
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="stripe.com"
                className="input-field pl-12 text-lg py-4"
                disabled={loading}
              />
            </div>
            {error && (
              <p className="mt-2 text-sm" style={{ color: "#FF5A5F" }}>{error}</p>
            )}
          </div>

          {/* Example domains */}
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="text-xs" style={{ color: "#6B7BA4" }}>Try:</span>
            {EXAMPLE_DOMAINS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDomain(d)}
                className="text-xs px-3 py-1 rounded-full transition-all"
                style={{
                  background: "rgba(109,93,246,0.1)",
                  color: domain === d ? "#8B7CFF" : "#6B7BA4",
                  border: `1px solid ${domain === d ? "rgba(109,93,246,0.4)" : "rgba(109,93,246,0.15)"}`,
                }}
              >
                {d}
              </button>
            ))}
          </div>

          <button
            id="launch-pipeline-btn"
            type="submit"
            disabled={loading || !domain.trim()}
            className="btn-primary w-full flex items-center justify-center gap-3 py-4 text-base"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Launching Pipeline...
              </>
            ) : (
              <>
                <Zap className="w-5 h-5" />
                Launch Pipeline
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Pipeline preview */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "#6B7BA4" }}>
          What happens next
        </h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {PIPELINE_STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={i} className="flex items-start gap-4 p-4 rounded-xl"
                style={{ background: "rgba(18,25,43,0.6)", border: "1px solid rgba(109,93,246,0.1)" }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(109,93,246,0.15)" }}>
                  <Icon className="w-4 h-4" style={{ color: "#8B7CFF" }} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-sm" style={{ color: "#E8EAF6" }}>{step.label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(109,93,246,0.1)", color: "#6D5DF6" }}>
                      {step.api}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: "#6B7BA4" }}>{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl"
          style={{ background: "rgba(0,200,150,0.05)", border: "1px solid rgba(0,200,150,0.2)" }}>
          <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: "#00C896" }} />
          <p className="text-sm" style={{ color: "#6B7BA4" }}>
            <span style={{ color: "#E8EAF6" }}>You approve before any email is sent.</span>{" "}
            ScoutFlow will never send emails without your explicit confirmation.
          </p>
        </div>
      </div>
    </div>
  );
}
