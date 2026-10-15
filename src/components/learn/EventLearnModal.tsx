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
  if (hints.length === 0) return null;
  return (
    <div className={styles.subBlock}>
      <div className={styles.subTitle}>{title}</div>
      <ul className={styles.hintList}>
        {hints.map((h, i) => (
          <li key={i} className={styles.hintItem}>
            <span className={styles.hintTier}>
              {hintTierLabel(type, h.tier, t)}
            </span>
            <span className={styles.hintContent}>{h.content}</span>
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
}: EventLearnModalProps) {
  const t = useTranslations("game");
  const distanceUnit = getDistanceUnitPreference();
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
    item.km != null
      ? `${item.title} · ${yearLabel(item.year)} · ${formatDistance(item.km, distanceUnit)}`
      : `${item.title} · ${yearLabel(item.year)}`;

  const data = state.status === "success" ? state.data : null;

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

              {data.event.description ? (
                <section className={styles.section}>
                  <div className={styles.sectionTitle}>
                    {t("learn_what_happened")}
                  </div>
                  <p className={styles.description}>
                    {data.event.description}
                  </p>
                </section>
              ) : null}

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

              <section className={styles.section}>
                <div className={styles.sectionTitle}>{t("learn_nearby")}</div>
                <div className={styles.subBlock}>
                  <div className={styles.subTitle}>
                    {t("learn_nearby_in_time")}
                  </div>
                  {data.nearbyInTime.length > 0 ? (
                    <ul className={styles.list}>
                      {data.nearbyInTime.map((item) => (
                        <li key={item.id} className={styles.listItem}>
                          {itemText(item)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className={styles.empty}>{t("learn_empty")}</div>
                  )}
                </div>
                <div className={styles.subBlock}>
                  <div className={styles.subTitle}>
                    {t("learn_nearby_in_place")}
                  </div>
                  {data.nearbyInPlace.length > 0 ? (
                    <ul className={styles.list}>
                      {data.nearbyInPlace.map((item) => (
                        <li key={item.id} className={styles.listItem}>
                          {itemText(item)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className={styles.empty}>{t("learn_empty")}</div>
                  )}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
