"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const NAV_LINKS = [
  { href: "/dashboard", icon: "dashboard", label: "Dashboard" },
  { href: "/pipeline", icon: "analytics", label: "Pipeline Runs" },
  { href: "/prospects", icon: "group", label: "Prospects" },
  { href: "/campaigns", icon: "send", label: "Campaigns" },
  { href: "/reports", icon: "monitoring", label: "Reports" },
  { href: "/settings", icon: "settings", label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex flex-col py-8 px-4 h-full bg-[var(--color-surface)] border-r border-[var(--color-border-subtle)] fixed left-0 top-0 w-64 z-40">
      {/* Header */}
      <div className="mb-8 px-2 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-container)] flex items-center justify-center">
          <span className="material-symbols-outlined text-[var(--color-on-primary-container)] text-sm">rocket_launch</span>
        </div>
        <div>
          <h1 className="font-headline-md text-headline-md font-bold text-[var(--color-on-surface)]">ScoutFlow</h1>
          <p className="font-label-sm text-label-sm text-[var(--color-on-surface-variant)]">AI Outbound</p>
        </div>
      </div>

      {/* CTA */}
      <Link href="/pipeline">
        <button className="mb-8 w-full btn-gradient py-2 px-4 rounded-lg font-label-md text-label-md flex items-center justify-center gap-2 cursor-pointer">
          <span className="material-symbols-outlined text-sm">add</span>
          New Pipeline
        </button>
      </Link>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto">
        <ul className="space-y-2">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? "bg-[var(--color-surface-container-high)] text-[var(--color-primary)] font-bold border-r-2 border-[var(--color-primary)]"
                      : "text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)] hover:text-[var(--color-on-surface)]"
                  }`}
                >
                  <span 
                    className="material-symbols-outlined" 
                    style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                  >
                    {link.icon}
                  </span>
                  <span className="font-label-md text-label-md">{link.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Footer Links */}
      <div className="mt-auto pt-4 border-t border-[var(--color-border-subtle)]">
        <ul className="space-y-2">
          <li>
            <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)] hover:text-[var(--color-on-surface)] transition-colors">
              <span className="material-symbols-outlined">help</span>
              <span className="font-label-md text-label-md">Support</span>
            </a>
          </li>
          <li>
            <button 
              onClick={() => signOut({ callbackUrl: "/" })}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)] hover:text-[var(--color-on-surface)] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined">logout</span>
              <span className="font-label-md text-label-md">Sign Out</span>
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}
