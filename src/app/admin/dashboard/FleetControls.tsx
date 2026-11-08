"use client";

// Client controls for the AI fleet page (ADM-BUILD-FLEETDASH-1107-120):
// per-mode toggles (existing toggleAiPlayerMode), alert dismiss
// (existing resolveFleetAlert) and the collapsed settings section.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleAiPlayerMode, resolveFleetAlert } from "./actions";

export function ModeToggle({
  playerId,
  mode,
  on,
  label,
}: {
  playerId: string;
  mode: "daily" | "practice";
  on: boolean;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={`ops-chip ops-chip-toggle${on ? " ops-chip-on" : ""}`}
      aria-pressed={on}
      disabled={pending}
      title={`${label}: ${on ? "on" : "off"} — click to switch`}
      onClick={() =>
        startTransition(async () => {
          await toggleAiPlayerMode(playerId, mode, !on);
        })
      }
    >
      {label}
    </button>
  );
}

export function DismissAlertButton({ alertId }: { alertId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className="ops-btn"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await resolveFleetAlert(alertId);
          router.refresh();
        })
      }
    >
      {pending ? "…" : "Dismiss"}
    </button>
  );
}

export function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="fleet-section">
      <button
        type="button"
        className="ops-btn fleet-disclosure"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {title} <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="fleet-disclosure-body">{children}</div>}
    </section>
  );
}
