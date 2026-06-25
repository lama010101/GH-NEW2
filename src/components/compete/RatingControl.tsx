"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import styles from "./RatingControl.module.css";

interface RatingControlProps {
  eventId: string;
}

export default function RatingControl({ eventId }: RatingControlProps) {
  const t = useTranslations("game");
  const [open, setOpen] = useState(false);
  const [currentRating, setCurrentRating] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    fetch(`/api/ratings?event_id=${encodeURIComponent(eventId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data.rating === "number") {
          setCurrentRating(data.rating);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const submit = async (rating: number) => {
    setPending(rating);
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, rating }),
      });
      if (res.ok) {
        setCurrentRating(rating);
        setSaved(true);
      }
    } catch {
      // ignore — user can retry
    } finally {
      setSaving(false);
      setPending(null);
    }
  };

  if (!open) {
    return (
      <button
        className={styles.rateButton}
        onClick={() => setOpen(true)}
        data-testid="rate-trigger"
      >
        {currentRating ? `${t("rate")} ${currentRating}/10` : t("rate")}
      </button>
    );
  }

  return (
    <div className={styles.wrap} data-testid="rating-control">
      <div className={styles.scale}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const isActive = (pending ?? currentRating) === n;
          return (
            <button
              key={n}
              className={`${styles.cell} ${isActive ? styles.cellActive : ""}`}
              onClick={() => submit(n)}
              disabled={saving}
            >
              {n}
            </button>
          );
        })}
      </div>
      {saved && <span className={styles.savedLabel}>{t("rate_saved")}</span>}
      <button className={styles.closeInline} onClick={() => setOpen(false)} disabled={saving}>
        ×
      </button>
    </div>
  );
}
