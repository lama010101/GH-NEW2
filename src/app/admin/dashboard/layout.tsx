import "./ops.css";
import { AdminShell } from "./components/AdminShell";

export const dynamic = "force-dynamic";

// Ops Console shell for every /admin/dashboard/** route
// (AIP-BUILD-DASHBOARDREDESIGN-FULLUIX-002). The scoped .ops-console class
// pins the admin palette (light, deterministic — independent of the gh_theme
// cookie). Gating is inherited from src/middleware.ts, which requires
// profiles.role === 'admin' for /admin/**.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const envLabel = process.env.NODE_ENV === "production" ? "prod" : "dev";
  return (
    <div className="ops-console">
      <AdminShell envLabel={envLabel}>{children}</AdminShell>
    </div>
  );
}
