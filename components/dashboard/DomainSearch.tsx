"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchWithRetry } from "@/lib/api";

export default function DomainSearch() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const parsedDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!parsedDomain) return;

    setLoading(true);
    try {
      const data = await fetchWithRetry<{ runId: string }>("/api/pipeline/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: parsedDomain }),
      });
      router.push(`/pipeline/${data.runId}`);
    } catch (err: any) {
      setError(err?.data?.error ?? err.message ?? "Pipeline telemetry failure. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="relative z-10 max-w-2xl">
      <h3 className="text-2xl font-bold text-foreground mb-2">Initiate Target Search</h3>
      <p className="text-base text-muted-foreground mb-6">Enter a target domain or company name to begin automated prospecting.</p>
      
      <form onSubmit={handleLaunch} className="flex flex-col sm:flex-row gap-4 relative">
        <div className="relative flex-1 group">
          <Input 
            type="text" 
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            disabled={loading}
            className="h-14 font-mono w-full" 
            placeholder="e.g., acmecorp.com" 
          />
        </div>
        <Button 
          type="submit" 
          isLoading={loading}
          size="lg"
          className="h-14 px-8"
        >
          {!loading && <span className="material-symbols-outlined mr-2">radar</span>}
          {loading ? "Scanning..." : "Start Scanning"}
        </Button>
      </form>
      
      {error && (
        <p className="mt-3 text-sm text-destructive font-medium">{error}</p>
      )}

      <div className="mt-4 flex gap-2 flex-wrap items-center">
        <span className="text-xs text-muted-foreground uppercase tracking-wider py-1 font-semibold">Recent:</span>
        <button onClick={() => setDomain("stripe.com")} className="px-3 py-1 flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-mono hover:bg-primary/20 transition-colors">
          stripe.com <span className="material-symbols-outlined text-[12px]">north_east</span>
        </button>
        <button onClick={() => setDomain("vercel.com")} className="px-3 py-1 flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-mono hover:bg-primary/20 transition-colors">
          vercel.com <span className="material-symbols-outlined text-[12px]">north_east</span>
        </button>
      </div>
    </div>
  );
}
