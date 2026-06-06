"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Menu, X } from "lucide-react";

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
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Desktop Sidebar */}
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

      {/* Mobile Top Header */}
      <div className="flex md:hidden items-center justify-between px-6 py-4 bg-[var(--color-surface)] border-b border-[var(--color-border-subtle)] fixed top-0 left-0 right-0 z-50 h-16">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-container)] flex items-center justify-center">
            <span className="material-symbols-outlined text-[var(--color-on-primary-container)] text-sm">rocket_launch</span>
          </div>
          <h1 className="font-bold text-[var(--color-on-surface)] text-lg">ScoutFlow</h1>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 rounded text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)]"
          aria-label="Toggle Menu"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div className="fixed inset-0 top-16 z-40 bg-[var(--color-surface)] md:hidden flex flex-col p-6 space-y-6 overflow-y-auto">
          <Link href="/pipeline" onClick={() => setIsOpen(false)}>
            <button className="w-full btn-gradient py-3 px-4 rounded-lg font-label-md text-label-md flex items-center justify-center gap-2 cursor-pointer">
              <span className="material-symbols-outlined text-sm">add</span>
              New Pipeline
            </button>
          </Link>

          <ul className="space-y-4 flex-1">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? "bg-[var(--color-surface-container-high)] text-[var(--color-primary)] font-bold"
                        : "text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)]"
                    }`}
                  >
                    <span className="material-symbols-outlined">{link.icon}</span>
                    <span className="font-label-md text-base">{link.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="pt-6 border-t border-[var(--color-border-subtle)] space-y-4">
            <a href="#" className="flex items-center gap-3 px-4 py-3 rounded-lg text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)]">
              <span className="material-symbols-outlined">help</span>
              <span className="font-label-md">Support</span>
            </a>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)] text-left"
            >
              <span className="material-symbols-outlined">logout</span>
              <span className="font-label-md">Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
