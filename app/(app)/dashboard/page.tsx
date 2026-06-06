import { Suspense } from "react";
import DomainSearch from "@/components/dashboard/DomainSearch";
import DashboardMetrics from "@/components/dashboard/DashboardMetrics";

export default function DashboardPage() {
  return (
    <>
      {/* Header */}
      <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="font-headline-lg text-display-lg-mobile md:text-headline-lg text-[var(--color-on-surface)] tracking-tight mb-2">
            Welcome back, Agent.
          </h2>
          <p className="font-body-md text-body-md text-[var(--color-on-surface-variant)]">
            System operations normal. Ready for new instructions.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[var(--color-surface-container-high)] px-3 py-1.5 rounded-full border border-[var(--color-border-subtle)]">
            <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] ai-aura"></div>
            <span className="font-mono-data text-mono-data text-[var(--color-primary)]">AI Active</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-[var(--color-surface)] border border-[var(--color-border-subtle)] overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-[var(--color-primary)]/20 to-transparent"></div>
            <span className="material-symbols-outlined absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[var(--color-on-surface-variant)]">person</span>
          </div>
        </div>
      </header>

      {/* Domain Input Section (Hero) */}
      <section className="mb-12 relative">
        <div className="absolute -inset-4 bg-[var(--color-primary)]/5 blur-3xl rounded-[3rem] -z-10"></div>
        <div className="glass-card rounded-2xl p-8 relative overflow-hidden">
          <div 
            className="absolute inset-0 opacity-[0.03] pointer-events-none" 
            style={{ backgroundImage: "radial-gradient(var(--color-primary) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
          ></div>
          <DomainSearch />
        </div>
      </section>

      {/* Bento Grid Layout wrapped in Suspense */}
      <Suspense fallback={<div className="animate-pulse h-96 bg-[var(--color-surface-container-low)] rounded-xl border border-[var(--color-border-subtle)]"></div>}>
        <DashboardMetrics />
      </Suspense>
    </>
  );
}
