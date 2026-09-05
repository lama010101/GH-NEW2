"use client";

// RecordDrawer — the single shared slide-in record panel for every admin
// dashboard data table (AIP-BUILD-DASHBOARDREDESIGN-FULLUIX-002).
// Open/close is URL-param driven from server pages (?drawer=<id>), so the
// drawer works without client state on the page; Escape and scrim clicks
// navigate to closeHref. Pages configure it with fields/actions; pages whose
// content does not fit key-value rows pass renderBody instead of forking.

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type DrawerField = {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
};

export function RecordDrawer({
  open,
  closeHref,
  title,
  subtitle,
  fields,
  actions,
  renderBody,
}: {
  open: boolean;
  closeHref: string;
  title: string;
  subtitle?: string;
  fields?: DrawerField[];
  actions?: React.ReactNode;
  renderBody?: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(closeHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeHref, router]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label={title}>
      <div className="ops-drawer-scrim" onClick={() => router.push(closeHref)} />
      <aside className="ops-drawer">
        <header className="ops-drawer-head">
          <div>
            <h2 className="ops-drawer-title">{title}</h2>
            {subtitle && <p className="ops-drawer-subtitle">{subtitle}</p>}
          </div>
          <Link href={closeHref} className="ops-btn" aria-label="Close record">
            Close
          </Link>
        </header>
        {actions && <div className="ops-drawer-actions">{actions}</div>}
        {renderBody}
        {fields && fields.length > 0 && (
          <dl className="ops-fields">
            {fields.map((f) => (
              <div className="ops-field" key={f.label}>
                <dt className="ops-field-label">{f.label}</dt>
                <dd className={`ops-field-value${f.mono ? " ops-mono" : ""}`}>
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </aside>
    </div>
  );
}
