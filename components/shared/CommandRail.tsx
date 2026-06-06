"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Crosshair, // Replacing Zap with a more "Mission Control" icon
  LayoutDashboard, GitBranch, Users, Mail,
  BarChart3, Settings, LogOut,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Mission Control" },
  { href: "/pipeline", icon: GitBranch, label: "Pipelines" },
  { href: "/prospects", icon: Users, label: "Targets" },
  { href: "/campaigns", icon: Mail, label: "Launches" },
  { href: "/reports", icon: BarChart3, label: "Telemetry" },
];

export default function CommandRail() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between"
         style={{ background: "rgba(3, 3, 3, 0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid var(--brand-border)" }}>
      
      <div className="flex items-center gap-8">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-white flex items-center justify-center">
            <Crosshair className="w-5 h-5" style={{ color: "#000" }} />
          </div>
          <span className="font-black text-lg tracking-tight" style={{ color: "var(--brand-text)" }}>SCOUTFLOW</span>
        </Link>

        <div className="hidden md:flex items-center gap-2">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={href} href={href} 
                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-all duration-200 ${isActive ? 'bg-[var(--brand-surface-2)] text-[var(--brand-text)] border border-[var(--brand-border-hover)]' : 'text-[var(--brand-muted)] hover:text-[var(--brand-text)] hover:bg-[var(--brand-surface)]'}`}>
                <Icon className="w-4 h-4" />
                {label}
                {isActive && <div className="w-1.5 h-1.5 rounded-full ml-1" style={{ background: "var(--brand-primary)" }} />}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Link href="/pipeline" className="btn-primary">
          <Crosshair className="w-4 h-4" />
          Initialize Mission
        </Link>
        
        <div className="w-px h-6 bg-[var(--brand-border)]" />
        
        <button onClick={() => signOut({ callbackUrl: "/" })} className="text-[var(--brand-muted)] hover:text-[#FF453A] transition-colors">
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </nav>
  );
}
