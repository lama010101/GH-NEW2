"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Sidebar navigation for the admin dashboard IA.
// Groups: Dashboard (inner tabs), Events, Add AI, Users, Operations.
// Collapses to a horizontal scroll bar below the lg breakpoint.

type NavItem = { label: string; href: string; match: string };
type NavGroup = { heading: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    heading: "Dashboard",
    items: [
      { label: "Overview", href: "/admin/dashboard?tab=overview", match: "tab=overview" },
      { label: "AI Roster", href: "/admin/dashboard?tab=models", match: "tab=models" },
      { label: "Analytics", href: "/admin/dashboard?tab=analytics", match: "tab=analytics" },
      { label: "Compare", href: "/admin/dashboard?tab=compare", match: "tab=compare" },
      { label: "Debug", href: "/admin/dashboard?tab=debug", match: "tab=debug" },
    ],
  },
  {
    heading: "Events",
    items: [
      { label: "All events", href: "/admin/dashboard/events", match: "/admin/dashboard/events" },
    ],
  },
  {
    heading: "AI players",
    items: [
      { label: "Add AI", href: "/admin/dashboard/catalog", match: "/admin/dashboard/catalog" },
      { label: "Schedules", href: "/admin/dashboard/schedules", match: "/admin/dashboard/schedules" },
      { label: "Trash", href: "/admin/dashboard/trash", match: "/admin/dashboard/trash" },
    ],
  },
  {
    heading: "Users",
    items: [
      { label: "All users", href: "/admin/dashboard/users", match: "/admin/dashboard/users" },
    ],
  },
];

export function SidebarNav() {
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
      className="shrink-0 overflow-x-auto lg:w-56 lg:overflow-visible"
    >
      <div className="flex gap-4 lg:flex-col lg:gap-5">
        {GROUPS.map((group) => (
          <div key={group.heading} className="shrink-0 lg:shrink">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gh-text-sec">
              {group.heading}
            </p>
            <ul className="flex gap-2 lg:flex-col lg:gap-1">
              {group.items.map((item) => (
                <li key={item.href} className="shrink-0 lg:shrink">
                  <Link
                    href={item.href}
                    aria-current={isActive(item) ? "page" : undefined}
                    className={`block whitespace-nowrap rounded px-2 py-1 text-sm ${
                      isActive(item)
                        ? "bg-gh-text text-gh-bg-base"
                        : "text-gh-text-sec hover:text-gh-text"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
