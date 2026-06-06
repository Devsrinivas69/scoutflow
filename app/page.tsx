"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  Zap, Search, Mail, Users, BarChart3, ArrowRight,
  Globe, Shield, Clock, CheckCircle, ChevronRight,
  Sparkles, Target, TrendingUp
} from "lucide-react";

const PIPELINE_STAGES = [
  { icon: Globe, label: "Domain Input", desc: "stripe.com", color: "#6D5DF6" },
  { icon: Search, label: "Lookalike Discovery", desc: "Ocean.io finds 25 similar companies", color: "#8B7CFF" },
  { icon: Users, label: "Decision Makers", desc: "Prospeo finds 74 contacts", color: "#a78bfa" },
  { icon: Shield, label: "Email Verification", desc: "Eazyreach verifies 51 emails", color: "#00C896" },
  { icon: Mail, label: "Outreach Sent", desc: "Brevo sends personalized campaigns", color: "#00C896" },
];

const FEATURES = [
  {
    icon: Search,
    title: "AI-Powered Company Discovery",
    desc: "Ocean.io finds companies that look exactly like your best customers — same industry, size, and growth stage.",
    gradient: "from-violet-500 to-purple-600",
  },
  {
    icon: Users,
    title: "Decision Maker Intelligence",
    desc: "Prospeo surfaces CEOs, VPs, and Directors who have the budget and authority to say yes.",
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    icon: Shield,
    title: "Verified Email Resolution",
    desc: "Eazyreach resolves and verifies work emails so you never waste a send on a bounced address.",
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    icon: Mail,
    title: "Personalized Outreach Automation",
    desc: "Brevo delivers hyper-personalized emails that reference the recipient's name, title, and company.",
    gradient: "from-orange-500 to-rose-500",
  },
  {
    icon: BarChart3,
    title: "Pipeline Analytics",
    desc: "Track open rates, response rates, and conversion at every stage of your outbound funnel.",
    gradient: "from-pink-500 to-violet-500",
  },
  {
    icon: Shield,
    title: "Mandatory Approval Gate",
    desc: "Review every email before it sends. ScoutFlow never fires off campaigns without your explicit go-ahead.",
    gradient: "from-amber-500 to-orange-500",
  },
];

const STATS = [
  { value: "25+", label: "Lookalike Companies" },
  { value: "74+", label: "Decision Makers" },
  { value: "51+", label: "Verified Emails" },
  { value: "< 5min", label: "Full Pipeline" },
];

function AnimatedPipeline() {
  const [activeStage, setActiveStage] = useState(0);
  const [completedStages, setCompletedStages] = useState<number[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStage((prev) => {
        const next = (prev + 1) % PIPELINE_STAGES.length;
        if (next === 0) setCompletedStages([]);
        else setCompletedStages((c) => [...c, prev]);
        return next;
      });
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative flex flex-col items-center gap-0 py-8">
      {PIPELINE_STAGES.map((stage, i) => {
        const Icon = stage.icon;
        const isActive = activeStage === i;
        const isDone = completedStages.includes(i);
        return (
          <div key={i} className="flex flex-col items-center">
            <div
              className="flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-500 w-full max-w-xs"
              style={{
                background: isActive
                  ? `rgba(${stage.color === "#6D5DF6" ? "109,93,246" : stage.color === "#8B7CFF" ? "139,124,255" : stage.color === "#a78bfa" ? "167,139,250" : "0,200,150"}, 0.15)`
                  : "rgba(18,25,43,0.6)",
                border: `1px solid ${isActive ? stage.color : isDone ? "rgba(0,200,150,0.3)" : "rgba(109,93,246,0.15)"}`,
                boxShadow: isActive ? `0 0 30px ${stage.color}33` : "none",
                transform: isActive ? "scale(1.04)" : "scale(1)",
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: isDone ? "rgba(0,200,150,0.2)" : `${stage.color}22` }}
              >
                {isDone ? (
                  <CheckCircle className="w-5 h-5" style={{ color: "#00C896" }} />
                ) : (
                  <Icon className="w-5 h-5" style={{ color: stage.color }} />
                )}
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold" style={{ color: isActive ? stage.color : "#E8EAF6" }}>
                  {stage.label}
                </div>
                <div className="text-xs" style={{ color: "#6B7BA4" }}>
                  {stage.desc}
                </div>
              </div>
              {isActive && (
                <div className="ml-auto">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: stage.color }} />
                </div>
              )}
            </div>
            {i < PIPELINE_STAGES.length - 1 && (
              <div className="flex flex-col items-center py-1">
                {[0, 1, 2].map((dot) => (
                  <div
                    key={dot}
                    className="w-0.5 h-1.5 rounded-full my-0.5 transition-all duration-300"
                    style={{
                      background: isDone || activeStage > i
                        ? "#6D5DF6"
                        : "rgba(109,93,246,0.2)",
                      opacity: isDone ? 1 : 0.4 + dot * 0.2,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(11,16,32,0.95)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(109,93,246,0.15)" : "none",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #6D5DF6, #8B7CFF)" }}
          >
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg text-white">ScoutFlow</span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          {["Features", "How it Works", "Pricing"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/ /g, "-")}`}
              className="text-sm font-medium transition-colors duration-200"
              style={{ color: "#6B7BA4" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#E8EAF6")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#6B7BA4")}
            >
              {item}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sign-in">
            <button className="btn-ghost text-sm px-4 py-2">Sign In</button>
          </Link>
          <Link href="/sign-up">
            <button className="btn-primary text-sm px-5 py-2">
              Start Free
            </button>
          </Link>
        </div>
      </div>
    </nav>
  );
}

export default function LandingPage() {
  const [domain, setDomain] = useState("");

  return (
    <div style={{ background: "#0B1020", minHeight: "100vh", overflow: "hidden" }}>
      <NavBar />

      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div
          className="absolute"
          style={{
            width: 800,
            height: 800,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(109,93,246,0.06) 0%, transparent 70%)",
            top: "40%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      {/* ── HERO ──────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: copy */}
            <div>
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-6"
                style={{
                  background: "rgba(109,93,246,0.1)",
                  border: "1px solid rgba(109,93,246,0.3)",
                  color: "#8B7CFF",
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Automated Outbound Intelligence
              </div>

              <h1
                className="text-5xl lg:text-7xl font-black leading-[1.05] mb-6 tracking-tight"
                style={{ color: "#E8EAF6" }}
              >
                One Domain.
                <br />
                <span className="gradient-text">Hundreds of</span>
                <br />
                Qualified Leads.
              </h1>

              <p className="text-xl mb-8 max-w-lg leading-relaxed" style={{ color: "#6B7BA4" }}>
                ScoutFlow discovers lookalike companies, finds decision makers,
                verifies work emails, and launches personalized outreach —{" "}
                <span style={{ color: "#E8EAF6" }}>automatically</span>.
              </p>

              {/* Demo input */}
              <div
                className="flex gap-3 mb-10 p-2 rounded-2xl"
                style={{
                  background: "rgba(18,25,43,0.8)",
                  border: "1px solid rgba(109,93,246,0.25)",
                }}
              >
                <div className="flex items-center px-3">
                  <Globe className="w-4 h-4" style={{ color: "#6B7BA4" }} />
                </div>
                <input
                  type="text"
                  placeholder="Enter a company domain (e.g. stripe.com)"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: "#E8EAF6" }}
                />
                <Link href="/sign-up">
                  <button className="btn-primary flex items-center gap-2 whitespace-nowrap">
                    Start Prospecting
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </Link>
              </div>

              {/* Social proof stats */}
              <div className="flex flex-wrap gap-6">
                {STATS.map((s) => (
                  <div key={s.label}>
                    <div className="text-2xl font-black gradient-text">{s.value}</div>
                    <div className="text-xs" style={{ color: "#6B7BA4" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: animated pipeline */}
            <div className="relative">
              <div
                className="rounded-3xl p-6"
                style={{
                  background: "rgba(18,25,43,0.7)",
                  border: "1px solid rgba(109,93,246,0.2)",
                  backdropFilter: "blur(20px)",
                }}
              >
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-3 h-3 rounded-full" style={{ background: "#FF5A5F" }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: "#FFB547" }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: "#00C896" }} />
                  <span className="ml-3 text-sm font-mono" style={{ color: "#6B7BA4" }}>
                    Pipeline running...
                  </span>
                </div>
                <AnimatedPipeline />
              </div>
              {/* Decorative glow */}
              <div
                className="absolute -z-10"
                style={{
                  width: 400,
                  height: 400,
                  background: "radial-gradient(circle, rgba(109,93,246,0.2) 0%, transparent 70%)",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%,-50%)",
                  filter: "blur(40px)",
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────── */}
      <section id="how-it-works" className="relative py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4" style={{ color: "#E8EAF6" }}>
              From Domain to Deal in{" "}
              <span className="gradient-text">5 Minutes</span>
            </h2>
            <p style={{ color: "#6B7BA4" }}>
              ScoutFlow orchestrates four powerful APIs so you don't have to.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            {[
              { num: "01", label: "Ocean.io", action: "Finds 25 lookalike companies", icon: Search, color: "#6D5DF6" },
              { num: "02", label: "Prospeo", action: "Discovers decision makers", icon: Users, color: "#8B7CFF" },
              { num: "03", label: "Eazyreach", action: "Verifies work emails", icon: Shield, color: "#a78bfa" },
              { num: "04", label: "Brevo", action: "Sends personalized outreach", icon: Mail, color: "#00C896" },
            ].map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="relative">
                  <div
                    className="rounded-2xl p-6 h-full transition-all duration-300"
                    style={{
                      background: "rgba(18,25,43,0.7)",
                      border: "1px solid rgba(109,93,246,0.15)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = step.color;
                      (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(109,93,246,0.15)";
                      (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                    }}
                  >
                    <div
                      className="text-5xl font-black mb-4"
                      style={{ color: "rgba(109,93,246,0.2)" }}
                    >
                      {step.num}
                    </div>
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                      style={{ background: `${step.color}22` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: step.color }} />
                    </div>
                    <div className="font-bold text-lg mb-1" style={{ color: "#E8EAF6" }}>{step.label}</div>
                    <div className="text-sm" style={{ color: "#6B7BA4" }}>{step.action}</div>
                  </div>
                  {i < 3 && (
                    <div
                      className="hidden md:flex absolute -right-2 top-1/2 -translate-y-1/2 z-10 w-4 h-4 items-center justify-center"
                    >
                      <ChevronRight className="w-4 h-4" style={{ color: "#6D5DF6" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────── */}
      <section id="features" className="relative py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4" style={{ color: "#E8EAF6" }}>
              Everything You Need to{" "}
              <span className="gradient-text">Scale Outbound</span>
            </h2>
            <p style={{ color: "#6B7BA4" }}>
              A complete outbound intelligence stack, wrapped in one elegant workflow.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={i}
                  className="rounded-2xl p-6 group cursor-default transition-all duration-300"
                  style={{
                    background: "rgba(18,25,43,0.7)",
                    border: "1px solid rgba(109,93,246,0.15)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(109,93,246,0.4)";
                    (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "0 16px 48px rgba(109,93,246,0.12)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(109,93,246,0.15)";
                    (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                  }}
                >
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-gradient-to-br ${f.gradient}`}
                  >
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-bold text-lg mb-2" style={{ color: "#E8EAF6" }}>
                    {f.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: "#6B7BA4" }}>
                    {f.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── APPROVAL HIGHLIGHT ────────────────────────────── */}
      <section className="relative py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div
            className="rounded-3xl p-10 text-center"
            style={{
              background: "linear-gradient(135deg, rgba(109,93,246,0.1) 0%, rgba(0,200,150,0.05) 100%)",
              border: "1px solid rgba(109,93,246,0.25)",
            }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
              style={{ background: "rgba(0,200,150,0.15)", border: "1px solid rgba(0,200,150,0.3)" }}
            >
              <Shield className="w-8 h-8" style={{ color: "#00C896" }} />
            </div>
            <h2 className="text-3xl font-bold mb-4" style={{ color: "#E8EAF6" }}>
              You&apos;re Always in Control
            </h2>
            <p className="text-lg mb-6 max-w-2xl mx-auto" style={{ color: "#6B7BA4" }}>
              ScoutFlow never sends emails automatically. Before any campaign goes out,
              you review every recipient, subject line, and email body — and approve with one click.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {["Review before send", "Edit any email", "Cancel anytime"].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-sm"
                  style={{ background: "rgba(0,200,150,0.1)", color: "#00C896" }}
                >
                  <CheckCircle className="w-4 h-4" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────── */}
      <section id="pricing" className="relative py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4" style={{ color: "#E8EAF6" }}>
              Simple, <span className="gradient-text">Transparent</span> Pricing
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: "Starter", price: "$0", period: "/mo", highlight: false,
                features: ["5 pipeline runs/mo", "250 prospects", "CSV export", "Email support"],
              },
              {
                name: "Growth", price: "$49", period: "/mo", highlight: true,
                features: ["50 pipeline runs/mo", "2,500 prospects", "All exports", "Priority support", "Analytics dashboard"],
              },
              {
                name: "Enterprise", price: "Custom", period: "", highlight: false,
                features: ["Unlimited runs", "Unlimited prospects", "Dedicated support", "Custom integrations", "SLA"],
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className="rounded-2xl p-6"
                style={{
                  background: plan.highlight
                    ? "linear-gradient(135deg, rgba(109,93,246,0.15), rgba(139,124,255,0.1))"
                    : "rgba(18,25,43,0.7)",
                  border: plan.highlight
                    ? "1px solid rgba(109,93,246,0.5)"
                    : "1px solid rgba(109,93,246,0.15)",
                  boxShadow: plan.highlight ? "0 0 40px rgba(109,93,246,0.2)" : "none",
                }}
              >
                {plan.highlight && (
                  <div
                    className="text-xs font-bold px-3 py-1 rounded-full mb-4 inline-block"
                    style={{ background: "rgba(109,93,246,0.2)", color: "#8B7CFF" }}
                  >
                    MOST POPULAR
                  </div>
                )}
                <div className="font-bold text-xl mb-1" style={{ color: "#E8EAF6" }}>{plan.name}</div>
                <div className="mb-6">
                  <span className="text-4xl font-black" style={{ color: plan.highlight ? "#8B7CFF" : "#E8EAF6" }}>
                    {plan.price}
                  </span>
                  <span className="text-sm" style={{ color: "#6B7BA4" }}>{plan.period}</span>
                </div>
                <div className="space-y-3 mb-6">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-sm" style={{ color: "#E8EAF6" }}>
                      <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: "#00C896" }} />
                      {f}
                    </div>
                  ))}
                </div>
                <Link href="/sign-up">
                  <button
                    className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-300 ${plan.highlight ? "btn-primary" : "btn-ghost"}`}
                  >
                    {plan.name === "Enterprise" ? "Contact Sales" : "Get Started"}
                  </button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────── */}
      <section className="relative py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div
            className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-8"
            style={{ background: "linear-gradient(135deg, #6D5DF6, #8B7CFF)" }}
          >
            <Target className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-5xl font-black mb-6" style={{ color: "#E8EAF6" }}>
            Ready to <span className="gradient-text">Automate</span>
            <br />Your Outbound?
          </h2>
          <p className="text-xl mb-10" style={{ color: "#6B7BA4" }}>
            Join teams using ScoutFlow to turn one domain into a full pipeline of qualified prospects.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up">
              <button className="btn-primary flex items-center gap-2 text-base px-8 py-4">
                <Zap className="w-5 h-5" />
                Start Prospecting Free
              </button>
            </Link>
            <Link href="/sign-in">
              <button className="btn-ghost flex items-center gap-2 text-base px-8 py-4">
                <TrendingUp className="w-5 h-5" />
                View Demo
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────── */}
      <footer
        className="py-12 px-6"
        style={{ borderTop: "1px solid rgba(109,93,246,0.15)" }}
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #6D5DF6, #8B7CFF)" }}
            >
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold" style={{ color: "#E8EAF6" }}>ScoutFlow</span>
          </div>
          <p className="text-sm" style={{ color: "#6B7BA4" }}>
            © {new Date().getFullYear()} ScoutFlow. One Domain. Unlimited Opportunities.
          </p>
          <div className="flex gap-6">
            {["Privacy", "Terms", "Contact"].map((l) => (
              <a key={l} href="#" className="text-sm transition-colors" style={{ color: "#6B7BA4" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#E8EAF6")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#6B7BA4")}>
                {l}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
