import { Suspense } from "react";
import DomainSearch from "@/components/dashboard/DomainSearch";
import DashboardMetrics from "@/components/dashboard/DashboardMetrics";

export default function DashboardPage() {
  return (
    <>
      {/* Header */}
      <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-2">
            Welcome back, Agent.
          </h2>
          <p className="text-base text-muted-foreground">
            System operations normal. Ready for new instructions.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-4">
          <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-full border border-border">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
            <span className="font-mono text-sm text-primary">AI Active</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-secondary border border-border overflow-hidden relative flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent"></div>
            <span className="material-symbols-outlined text-muted-foreground z-10">person</span>
          </div>
        </div>
      </header>

      {/* Domain Input Section (Hero) */}
      <section className="mb-12 relative">
        <div className="absolute -inset-4 bg-primary/5 blur-3xl rounded-[3rem] -z-10"></div>
        <div className="bg-card text-card-foreground border border-border rounded-2xl p-8 relative overflow-hidden shadow-sm">
          <div 
            className="absolute inset-0 opacity-[0.03] pointer-events-none" 
            style={{ backgroundImage: "radial-gradient(hsl(var(--primary)) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
          ></div>
          <DomainSearch />
        </div>
      </section>

      {/* Bento Grid Layout wrapped in Suspense */}
      <Suspense fallback={<div className="animate-pulse h-96 bg-card border border-border rounded-xl"></div>}>
        <DashboardMetrics />
      </Suspense>
    </>
  );
}
