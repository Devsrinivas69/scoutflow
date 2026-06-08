"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Crosshair, ArrowRight, Activity, Terminal } from "lucide-react";
import { motion } from "framer-motion";

function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(3,3,3,0.9)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? "1px solid var(--brand-border)" : "none",
      }}>
      <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-white flex items-center justify-center">
            <Crosshair className="w-5 h-5 text-black" />
          </div>
          <span className="font-black text-lg tracking-tight text-white uppercase">ScoutFlow</span>
        </div>
        
        <div className="hidden md:flex items-center gap-8 font-mono text-xs uppercase tracking-widest text-[var(--brand-muted)]">
          <a href="#intel" className="hover:text-white transition-colors">Intel</a>
          <a href="#capabilities" className="hover:text-white transition-colors">Capabilities</a>
          <a href="#deploy" className="hover:text-white transition-colors">Deploy</a>
        </div>
        
        <div className="flex items-center gap-3">
          <Link href="/sign-in">
            <button className="btn-ghost font-mono uppercase text-xs">Auth</button>
          </Link>
          <Link href="/sign-up">
            <button className="btn-primary font-mono uppercase text-xs">Initialize</button>
          </Link>
        </div>
      </div>
    </nav>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--brand-bg)] text-[var(--brand-text)] flex flex-col relative overflow-hidden">
      <div className="noise-overlay" />
      <NavBar />

      <main className="flex-1 flex flex-col relative z-10">
        <section className="min-h-screen flex flex-col items-center justify-center px-6 text-center pt-20">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-flex items-center gap-2 border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-1.5 mb-8 rounded-full">
              <div className="w-2 h-2 bg-[var(--brand-primary)] rounded-full animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--brand-muted)]">System Online. Awaiting coordinates.</span>
            </div>

            <h1 className="text-6xl md:text-[100px] font-black tracking-tighter uppercase leading-[0.9] mb-8 text-white">
              One Domain.<br/>
              <span className="text-[var(--brand-primary)]">Infinite</span> Intel.
            </h1>

            <p className="text-lg md:text-xl font-mono text-[var(--brand-muted)] max-w-2xl mx-auto mb-12 uppercase tracking-wide leading-relaxed">
              Scoutflow is a high-velocity targeting system. Enter a single domain. Extract lookalike organizations, decision makers, and verified comms in under 5 minutes.
            </p>

            <Link href="/sign-up">
              <button className="btn-primary px-8 py-5 text-sm uppercase tracking-widest group">
                Establish Connection 
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
          </motion.div>
        </section>

        <section id="capabilities" className="py-32 px-6 border-t border-[var(--brand-border)] bg-[#000]">
          <div className="max-w-[1400px] mx-auto">
            <div className="grid md:grid-cols-2 gap-16">
              <div>
                <h2 className="text-4xl md:text-5xl font-bold uppercase tracking-tight mb-6">Targeting Architecture</h2>
                <p className="font-mono text-[var(--brand-muted)] text-sm leading-relaxed max-w-md uppercase tracking-wide">
                  Our intelligence pipeline orchestrates four distinct APIs to build an unassailable outbound strategy.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {[
                  { id: "01", label: "Reconnaissance", desc: "Ocean.io identifies identical entity profiles." },
                  { id: "02", label: "Extraction", desc: "Prospeo retrieves key personnel and decision makers." },
                  { id: "03", label: "Email Discovery", desc: "Resend discovers contact patterns." },
                  { id: "04", label: "Deployment", desc: "Brevo launches personalized payloads." },
                ].map((c) => (
                  <div key={c.id} className="panel p-6 border-[var(--brand-border)] hover:border-[var(--brand-primary)] transition-colors group cursor-default">
                    <div className="text-[var(--brand-muted)] font-mono text-[10px] mb-4 group-hover:text-[var(--brand-primary)] transition-colors">PHASE {c.id}</div>
                    <div className="font-bold uppercase tracking-wide mb-2 text-white">{c.label}</div>
                    <div className="font-mono text-xs text-[var(--brand-muted)]">{c.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-32 px-6 bg-[var(--brand-primary)] text-black">
          <div className="max-w-[1400px] mx-auto text-center">
            <Activity className="w-16 h-16 mx-auto mb-8 opacity-80" />
            <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-8 leading-none">
              Absolute Control.<br/>Zero Misfires.
            </h2>
            <p className="font-mono text-sm max-w-xl mx-auto uppercase tracking-wider mb-12 font-semibold">
              The system never deploys without manual authorization. Inspect every payload. Confirm targets. Launch with absolute certainty.
            </p>
            <Link href="/sign-up">
              <button className="bg-black text-[var(--brand-primary)] px-8 py-4 font-bold text-sm uppercase tracking-widest hover:bg-white hover:text-black transition-colors">
                Initialize Free Trial
              </button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--brand-border)] py-8 px-6 bg-[#000]">
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="font-black uppercase tracking-tight text-white flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[var(--brand-primary)]" />
            SCOUTFLOW // 2026
          </div>
          <div className="font-mono text-[10px] text-[var(--brand-muted)] uppercase tracking-widest">
            End of Transmission.
          </div>
        </div>
      </footer>
    </div>
  );
}
