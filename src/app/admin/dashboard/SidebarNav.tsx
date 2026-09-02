"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Single nav surface for the admin dashboard IA (Ops Console redesign,
// AIP-BUILD-DASHBOARDREDESIGN-FULLUIX-002). Groups: Overview, Fleet
// (Models, Add AI, Schedules), Activity (Events, Analytics, Compare),
// Records (Users, Trash), System (Debug). The former in-page tab strip is
// removed; this sidebar is the only navigation. Responsive: ≥1280px full
// labels, 1024–1279px icon rail (title tooltips), <1024px off-canvas drawer
// driven by AdminShell.

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
        label: "Models",
        href: "/admin/dashboard?tab=models",
        match: "tab=models",
        icon: <Icon d="M5 5h14v14H5zM9 9h6v6H9z" />,
      },
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
      {
        label: "Analytics",
        href: "/admin/dashboard?tab=analytics",
        match: "tab=analytics",
        icon: <Icon d="M6 20V10M12 20V4M18 20v-6M3 20h18" />,
      },
      {
        label: "Compare",
        href: "/admin/dashboard?tab=compare",
        match: "tab=compare",
        icon: <Icon d="M4 4h6v16H4zM14 4h6v16h-6z" />,
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
    heading: "System",
    items: [
      {
        label: "Debug",
        href: "/admin/dashboard?tab=debug",
        match: "tab=debug",
        icon: <Icon d="M4 17l6-5-6-5M12 19h8" />,
      },
    ],
  },
];

export function SidebarNav({
  open,
  onNavigate,
}: {
  open: boolean;
  onNavigate: () => void;
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
      className={`ops-sidebar${open ? " ops-sidebar-open" : ""}`}
    >
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
