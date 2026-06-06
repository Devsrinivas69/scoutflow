"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Zap, LayoutDashboard, GitBranch, Users, Mail,
  BarChart3, Settings, LogOut, ChevronRight,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/pipeline", icon: GitBranch, label: "Pipeline" },
  { href: "/prospects", icon: Users, label: "Prospects" },
  { href: "/campaigns", icon: Mail, label: "Campaigns" },
  { href: "/reports", icon: BarChart3, label: "Reports" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="px-6 py-5 border-b" style={{ borderColor: "rgba(109,93,246,0.15)" }}>
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #6D5DF6, #8B7CFF)" }}>
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-base" style={{ color: "#E8EAF6" }}>ScoutFlow</span>
        </Link>
      </div>

      {/* Launch Pipeline CTA */}
      <div className="px-4 py-4">
        <Link href="/pipeline">
          <button className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 text-sm">
            <Zap className="w-4 h-4" />
            New Pipeline Run
            <ChevronRight className="w-3.5 h-3.5 ml-auto" />
          </button>
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-2">
        <div className="px-4 mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#6B7BA4" }}>
            Navigation
          </p>
        </div>
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link key={href} href={href} className={`sidebar-item ${isActive ? "active" : ""}`}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full"
                  style={{ background: "#6D5DF6" }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-4 py-4 border-t" style={{ borderColor: "rgba(109,93,246,0.15)" }}>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="sidebar-item w-full text-left"
          style={{ color: "#FF5A5F" }}
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
