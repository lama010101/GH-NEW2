"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Single nav surface for the admin dashboard IA (Ops Console redesign,
// AIP-BUILD-DASHBOARDREDESIGN-FULLUIX-002). Groups: Overview, Fleet
// (Models, Add AI, Schedules), Activity (Events, Analytics, Compare),
// Records (Users, Trash), System (Debug). The former in-page tab strip is
// removed; this sidebar is the only navigation. Responsive: ≥1280px full
// labels, 1024–1279px icon rail (title tooltips), <1024px off-canvas drawer
// driven by AdminShell. ≥1024px a toggle button lets the user force expand
// or collapse; the choice is persisted by AdminShell (ops-nav-pref).

type NavItem = { label: string; href: string; match: string; icon: JSX.Element };
type NavGroup = { heading: string | null; items: NavItem[] };

function Icon({ d }: { d: string }) {
  return (
    <svg
      className="ops-navicon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const GROUPS: NavGroup[] = [
  {
    heading: null,
    items: [
      {
        label: "Game home",
        href: "/home",
        match: "/home",
        icon: <Icon d="M3 11l9-8 9 8M5 9v12h14V9M10 21v-6h4v6" />,
      },
      {
        label: "Overview",
        href: "/admin/dashboard?tab=overview",
        match: "tab=overview",
        icon: <Icon d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />,
      },
    ],
  },
  {
    heading: "Fleet",
    items: [
      {
        label: "Add AI",
        href: "/admin/dashboard/catalog",
        match: "/admin/dashboard/catalog",
        icon: <Icon d="M12 5v14M5 12h14" />,
      },
      {
        label: "Schedules",
        href: "/admin/dashboard/schedules",
        match: "/admin/dashboard/schedules",
        icon: <Icon d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 3" />,
      },
    ],
  },
  {
    heading: "Activity",
    items: [
      {
        label: "Events",
        href: "/admin/dashboard/events",
        match: "/admin/dashboard/events",
        icon: <Icon d="M3 5h18v16H3zM8 3v4M16 3v4M3 10h18" />,
      },
    ],
  },
  {
    heading: "Records",
    items: [
      {
        label: "Users",
        href: "/admin/dashboard/users",
        match: "/admin/dashboard/users",
        icon: <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6" />,
      },
      {
        label: "Trash",
        href: "/admin/dashboard/trash",
        match: "/admin/dashboard/trash",
        icon: <Icon d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
      },
    ],
  },
  {
    heading: "Content",
    items: [
      {
        label: "Journey",
        href: "/admin/dashboard/journey",
        match: "/admin/dashboard/journey",
        icon: <Icon d="M3 5h18v16H3zM8 3v4M16 3v4M3 10h18" />,
      },
      {
        label: "Generator",
        href: "/admin/dashboard/generator",
        match: "/admin/dashboard/generator",
        icon: <Icon d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />,
      },
    ],
  },
];

export function SidebarNav({
  open,
  onNavigate,
  navOverride,
  navExpanded,
  onToggleNav,
}: {
  open: boolean;
  onNavigate: () => void;
  navOverride: "expanded" | "collapsed" | null;
  navExpanded: boolean;
  onToggleNav: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") ?? "overview";

  const isActive = (item: NavItem) =>
    item.href.includes("?")
      ? pathname === "/admin/dashboard" && currentTab === item.match.replace("tab=", "")
      : pathname === item.match || pathname.startsWith(item.match + "/");

  return (
    <nav
      aria-label="Admin dashboard"
      className={`ops-sidebar${open ? " ops-sidebar-open" : ""}${navOverride ? ` ops-sidebar--${navOverride}` : ""}`}
    >
      <button
        type="button"
        className="ops-navtoggle"
        aria-label={navExpanded ? "Collapse navigation" : "Expand navigation"}
        aria-expanded={navExpanded}
        onClick={onToggleNav}
      >
        <Icon d={navExpanded ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
        <span className="ops-navlabel">
          {navExpanded ? "Collapse navigation" : "Expand navigation"}
        </span>
      </button>
      {GROUPS.map((group) => (
        <div key={group.heading ?? "overview"} className="ops-navgroup">
          {group.heading && <p className="ops-navheading">{group.heading}</p>}
          <ul className="ops-navlist">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={isActive(item) ? "page" : undefined}
                  onClick={onNavigate}
                  className={`ops-navlink${isActive(item) ? " ops-navlink-active" : ""}`}
                >
                  {item.icon}
                  <span className="ops-navlabel">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
