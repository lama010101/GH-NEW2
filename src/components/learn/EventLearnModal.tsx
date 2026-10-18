"use client";

// LEARN-BUILD-EVENTMODAL-API-1015-001 / LEARN-BUILD-ABOUTEVENT-RESTRUCTURE-1018-011
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
import type { LearnClueItem, LearnListItem, LearnMode } from "@/core/learnTypes";
import { splitClueList } from "@/core/learnFormat";
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
    [item.title, yearLabel(item.year), item.location]
      .filter((p): p is string => p != null && p !== "")
      .join(" · ");

  const data = state.status === "success" ? state.data : null;
  // Fetched description wins once loaded; the passed round description fills
  // in while loading / on error / when the fetched event has none.
  const whatHappened = data?.description || description || null;

  const distanceUnit = getDistanceUnitPreference();
  const yearItems = splitClueList(data?.yearClues);
  const locationItems = splitClueList(data?.locationClues);

  // Same content + metadata rendering as the in-round hints-used card
  // (src/components/compete/RoundCompleteSection.tsx usedHints block).
  const clueText = (item: LearnClueItem, kind: "when" | "where"): string => {
    const meta = item.metadata;
    if (kind === "where" && meta?.km != null) {
      return `${item.content} • ${t("km_away_short", { distance: formatDistance(meta.km, distanceUnit) })}`;
    }
    if (kind === "when" && meta?.years != null) {
      return `${item.content} • ${t("years_off_short", { n: meta.years })}`;
    }
    return item.content;
  };

  const categoryItems: { key: string; label: string; text: string }[] = [];
  if (data) {
    const push = (
      key: string,
      label: string,
      item: LearnClueItem | null,
      kind: "when" | "where"
    ) => {
      if (item) categoryItems.push({ key, label, text: clueText(item, kind) });
    };
    push("historical", t("hint_historical_event"), data.historicalEvent, "when");
    push("contemporary", t("hint_contemporary_event"), data.contemporaryEvent, "when");
    push("remote", t("hint_remote_landmark"), data.remoteLandmark, "where");
    push("nearby", t("hint_nearby_landmark"), data.nearbyLandmark, "where");
  }
  const hasRelated =
    categoryItems.length > 0 || (data?.related.length ?? 0) > 0;
  const relatedCategory = data?.related[0]?.category || null;

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
            <>
              {yearItems.length > 0 ? (
                <section className={styles.section}>
                  <div className={styles.sectionTitle}>
                    {t("learn_find_year")}
                  </div>
                  <ul className={styles.list}>
                    {yearItems.map((item, i) => (
                      <li key={i} className={styles.listItem}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {locationItems.length > 0 ? (
                <section className={styles.section}>
                  <div className={styles.sectionTitle}>
                    {t("learn_find_location")}
                  </div>
                  <ul className={styles.list}>
                    {locationItems.map((item, i) => (
                      <li key={i} className={styles.listItem}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {hasRelated ? (
                <section className={styles.section}>
                  <div className={styles.sectionTitle}>
                    {t("learn_related_to")}
                  </div>
                  {categoryItems.length > 0 ? (
                    <ul className={styles.hintList}>
                      {categoryItems.map((c) => (
                        <li key={c.key} className={styles.hintItem}>
                          <span className={styles.hintTier}>{c.label}</span>
                          <span className={styles.hintContent}>{c.text}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {data.related.length > 0 ? (
                    <div className={styles.subBlock}>
                      <div className={styles.subTitle}>
                        {relatedCategory
                          ? `${t("learn_related_events")} · ${relatedCategory}`
                          : t("learn_related_events")}
                      </div>
                      <ul className={styles.list}>
                        {data.related.map((item) => (
                          <li key={item.id} className={styles.listItem}>
                            {itemText(item)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
