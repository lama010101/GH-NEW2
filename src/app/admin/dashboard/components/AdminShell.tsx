"use client";

// AdminShell — ops-console chrome for /admin/dashboard/**: sticky top bar
// (brand + env badge, never a nav) and the sidebar with its <1024px
// off-canvas state (AIP-BUILD-DASHBOARDREDESIGN-FULLUIX-002). ≥1024px the
// sidebar expand/collapse preference is owned here and persisted in
// localStorage (ops-nav-pref) — ADM-FIX-FLEETUI-1112-301.

import { useEffect, useState } from "react";
import { SidebarNav } from "../SidebarNav";

type NavPref = "auto" | "expanded" | "collapsed";

export function AdminShell({
  envLabel,
  children,
}: {
  envLabel: string;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [navPref, setNavPref] = useState<NavPref>("auto");
  const [navWide, setNavWide] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("ops-nav-pref");
      if (saved === "expanded" || saved === "collapsed") setNavPref(saved);
    } catch {
      // storage unavailable — keep the responsive default
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const onChange = () => setNavWide(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const navExpanded =
    navPref === "expanded" || (navPref === "auto" && navWide);

  const toggleNavPref = () => {
    const next: NavPref = navExpanded ? "collapsed" : "expanded";
    setNavPref(next);
    try {
      window.localStorage.setItem("ops-nav-pref", next);
    } catch {
      // storage unavailable — preference just won't persist
    }
  };

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
        <SidebarNav
          open={navOpen}
          onNavigate={() => setNavOpen(false)}
          navOverride={navPref === "auto" ? null : navPref}
          navExpanded={navExpanded}
          onToggleNav={toggleNavPref}
        />
        {navOpen && (
          <div className="ops-scrim" onClick={() => setNavOpen(false)} />
        )}
        <main className="ops-main">{children}</main>
      </div>
    </>
  );
}
