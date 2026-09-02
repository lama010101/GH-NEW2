import { SidebarNav } from "./SidebarNav";

export const dynamic = "force-dynamic";

// Top-level IA for the admin dashboard (AIP-BUILD-PRODASHBOARD-FULLUIX-002).
// Wraps every /admin/dashboard/** route (dashboard tabs, events, catalog,
// users, schedules, trash). Gating is inherited from src/middleware.ts,
// which requires profiles.role === 'admin' for /admin/**.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4 lg:flex-row lg:items-start">
      <SidebarNav />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
