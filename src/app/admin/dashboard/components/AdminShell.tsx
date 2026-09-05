"use client";

// AdminShell — ops-console chrome for /admin/dashboard/**: sticky top bar
// (brand + env badge, never a nav) and the sidebar with its <1024px
// off-canvas state (AIP-BUILD-DASHBOARDREDESIGN-FULLUIX-002).

import { useState } from "react";
import { SidebarNav } from "../SidebarNav";

export function AdminShell({
  envLabel,
  children,
}: {
  envLabel: string;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <>
      <header className="ops-topbar">
        <button
          type="button"
          className="ops-burger"
          aria-label="Toggle navigation"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((v) => !v)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <span className="ops-brand">GH Ops</span>
        <span className="ops-env">{envLabel}</span>
      </header>
      <div className="ops-body">
        <SidebarNav open={navOpen} onNavigate={() => setNavOpen(false)} />
        {navOpen && (
          <div className="ops-scrim" onClick={() => setNavOpen(false)} />
        )}
        <main className="ops-main">{children}</main>
      </div>
    </>
  );
}
