"use client";

// LEARN-BUILD-EVENTMODAL-API-1015-001
// Post-round learn modal. NOT wired into any screen yet — a screen renders
// <EventLearnModal open onClose eventId gameId mode /> when the time comes.
// Shell conventions (backdrop, role="dialog", Escape, focus handling) follow
// src/components/HintModal.tsx and src/components/RankModal.tsx.

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  formatDistance,
  getDistanceUnitPreference,
} from "@/lib/distance";
import type { LearnHint, LearnListItem, LearnMode } from "@/core/learnTypes";
import { useEventLearn } from "./useEventLearn";
import styles from "./EventLearnModal.module.css";

export type EventLearnModalProps = {
  open: boolean;
  onClose: () => void;
  eventId: string;
  gameId: string;
  mode: LearnMode;
  // LEARN-FIX-REPLACEHIST-1015-006 — round.description the event card used to
  // show under the Historical Context toggle. Rendered in "What happened"
  // while the learn fetch is in flight or if it fails, and as fallback when
  // the fetched event has no description.
  description?: string | null;
};

// Tier labels mirror HintModal's getHintLabel — same i18n keys, same mapping.
function hintTierLabel(
  type: "when" | "where",
  tier: number,
  t: (key: string) => string
): string {
  if (type === "when") {
    if (tier === 1) return t("hint_century");
    if (tier === 2) return t("hint_historical_event");
    if (tier === 3) return t("hint_decade");
    if (tier === 4) return t("hint_contemporary_event");
    if (tier === 5) return t("hint_visual_clues");
  }
  if (type === "where") {
    if (tier === 1) return t("hint_continent");
    if (tier === 2) return t("hint_remote_landmark");
    if (tier === 3) return t("hint_region");
    if (tier === 4) return t("hint_nearby_landmark");
    if (tier === 5) return t("hint_visual_clues");
  }
  return t("hint_label_default");
}

function HintBlock({
  type,
  hints,
  title,
}: {
  type: "when" | "where";
  hints: LearnHint[];
  title: string;
}) {
  const t = useTranslations("game");
  const distanceUnit = getDistanceUnitPreference();
  if (hints.length === 0) return null;
  // Same content + metadata rendering as the in-round hints-used card
  // (src/components/compete/RoundCompleteSection.tsx usedHints block).
  const hintText = (h: LearnHint): string => {
    const meta = h.metadata;
    if (type === "where" && (h.tier === 2 || h.tier === 4) && meta?.km != null) {
      return `${h.content} • ${t("km_away_short", { distance: formatDistance(meta.km, distanceUnit) })}`;
    }
    if (type === "when" && (h.tier === 2 || h.tier === 4) && meta?.years != null) {
      return `${h.content} • ${t("years_off_short", { n: meta.years })}`;
    }
    return h.content;
  };
  return (
    <div className={styles.subBlock}>
      <div className={styles.subTitle}>{title}</div>
      <ul className={styles.hintList}>
        {hints.map((h, i) => (
          <li key={i} className={styles.hintItem}>
            <span className={styles.hintTier}>
              {hintTierLabel(type, h.tier, t)}
            </span>
            <span className={styles.hintContent}>{hintText(h)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EventLearnModal({
  open,
  onClose,
  eventId,
  gameId,
  mode,
  description,
}: EventLearnModalProps) {
  const t = useTranslations("game");
  const closeRef = useRef<HTMLButtonElement>(null);
  const { state, refetch } = useEventLearn(open, eventId, gameId, mode);

  // RankModal focus convention: focus close button on open, restore on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handler);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const yearLabel = (y: number): string =>
    y < 0 ? `${Math.abs(y)} ${t("bc_suffix")}` : `${y}`;

  const itemText = (item: LearnListItem): string =>
    `${item.title} · ${yearLabel(item.year)}`;

  const data = state.status === "success" ? state.data : null;
  // Fetched description wins once loaded; the passed round description fills
  // in while loading / on error / when the fetched event has none.
  const whatHappened = data?.event.description || description || null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t("learn_title")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.title}>{t("learn_title")}</div>
          <button
            ref={closeRef}
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t("learn_close")}
          >
            <svg viewBox="0 0 10 10" fill="none">
              <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          {state.status === "loading" || state.status === "idle" ? (
            <div className={styles.stateMsg}>{t("loading")}</div>
          ) : state.status === "error" ? (
            <div className={styles.stateMsg}>
              <div>{t("learn_error")}</div>
              <button
                type="button"
                className={styles.retryBtn}
                onClick={refetch}
              >
                {t("retry")}
              </button>
            </div>
          ) : data ? (
            <>
              <div className={styles.eventHead}>
                <div className={styles.eventTitle}>{data.event.title}</div>
                <div className={styles.eventMeta}>
                  {yearLabel(data.event.year)}
                  {data.event.location?.name
                    ? ` · ${data.event.location.name}`
                    : ""}
                </div>
              </div>

              <section className={styles.section}>
                <div className={styles.sectionTitle}>
                  {t("learn_how_to_guess")}
                </div>
                <HintBlock
                  type="when"
                  hints={data.howToGuess.when}
                  title={t("when_badges")}
                />
                <HintBlock
                  type="where"
                  hints={data.howToGuess.where}
                  title={t("where_badges")}
                />
              </section>
            </>
          ) : null}

          {whatHappened ? (
            <section className={styles.section}>
              <div className={styles.sectionTitle}>
                {t("learn_what_happened")}
              </div>
              <p className={styles.description}>{whatHappened}</p>
            </section>
          ) : null}

          {data ? (
            <section className={styles.section}>
              <div className={styles.sectionTitle}>
                {t("learn_related_events")}
              </div>
              {data.related.length > 0 ? (
                <ul className={styles.list}>
                  {data.related.map((item) => (
                    <li key={item.id} className={styles.listItem}>
                      {itemText(item)}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={styles.empty}>{t("learn_empty")}</div>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
