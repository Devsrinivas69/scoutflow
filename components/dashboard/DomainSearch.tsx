"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DomainSearch() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!domain.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/pipeline/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "") }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to initialize mission");
        setLoading(false);
      } else {
        router.push(`/pipeline/${data.runId}`);
      }
    } catch {
      setError("Telemtry failure. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="relative z-10 max-w-2xl">
      <h3 className="font-headline-md text-headline-md text-[var(--color-on-surface)] mb-2">Initiate Target Search</h3>
      <p className="font-body-md text-body-md text-[var(--color-on-surface-variant)] mb-6">Enter a target domain or company name to begin automated prospecting.</p>
      
      <form onSubmit={handleLaunch} className="flex flex-col sm:flex-row gap-4 relative">
        <div className="relative flex-1 group">
          <span className="material-symbols-outlined absolute left-4 top-1/2 transform -translate-y-1/2 text-[var(--color-on-surface-variant)] group-focus-within:text-[var(--color-primary)] transition-colors">language</span>
          <input 
            type="text" 
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            disabled={loading}
            className="w-full bg-[var(--color-background)] border border-[var(--color-outline-variant)] rounded-xl py-4 pl-12 pr-4 font-mono-data text-mono-data text-[var(--color-on-surface)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/50 transition-all placeholder:text-[var(--color-outline-variant)]" 
            placeholder="e.g., acmecorp.com" 
          />
        </div>
        <button 
          type="submit" 
          disabled={loading}
          className="btn-gradient py-4 px-8 rounded-xl font-label-md text-label-md flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="material-symbols-outlined">radar</span>
          )}
          {loading ? "Scanning..." : "Start Scanning"}
        </button>
      </form>
      
      {error && (
        <p className="mt-3 text-sm text-[var(--color-error)] font-medium">{error}</p>
      )}

      <div className="mt-4 flex gap-2 flex-wrap">
        <span className="font-label-sm text-label-sm text-[var(--color-on-surface-variant)] opacity-70 uppercase tracking-wider py-1">Recent:</span>
        <button onClick={() => setDomain("stripe.com")} className="px-3 py-1 rounded-full bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 font-mono-data text-mono-data text-[var(--color-primary)] text-xs flex items-center gap-1 cursor-pointer hover:bg-[var(--color-primary)]/20 transition-colors">
          stripe.com <span className="material-symbols-outlined text-[12px]">north_east</span>
        </button>
        <button onClick={() => setDomain("vercel.com")} className="px-3 py-1 rounded-full bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 font-mono-data text-mono-data text-[var(--color-primary)] text-xs flex items-center gap-1 cursor-pointer hover:bg-[var(--color-primary)]/20 transition-colors">
          vercel.com <span className="material-symbols-outlined text-[12px]">north_east</span>
        </button>
      </div>
    </div>
  );
}
