"use client";

// LEARN-BUILD-EVENTMODAL-API-1015-001 / LEARN-BUILD-ABOUTEVENT-RESTRUCTURE-1018-011
// Post-round learn modal. NOT wired into any screen yet — a screen renders
// <EventLearnModal open onClose eventId gameId mode /> when the time comes.
// Shell conventions (backdrop, role="dialog", Escape, focus handling) follow
// src/components/HintModal.tsx and src/components/RankModal.tsx.

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  BookOpen,
  Calendar,
  Check,
  Landmark,
  Link2,
  MapPin,
  Map as MapIcon,
  History,
} from "lucide-react";
import {
  formatDistance,
  getDistanceUnitPreference,
} from "@/lib/distance";
import type { LearnClueItem, LearnMode } from "@/core/learnTypes";
import { splitClueList } from "@/core/learnFormat";
import { pointColor } from "@/core/learnMapColors";
import { useEventLearn } from "./useEventLearn";
import styles from "./EventLearnModal.module.css";

const LearnLocationMap = dynamic(
  () => import("./LearnLocationMap").then((m) => m.LearnLocationMap),
  { ssr: false }
);

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
  // Entry highlighted on the "Related location" map (list click or pin click).
  const [activeId, setActiveId] = useState<string | null>(null);

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

  // "Remote landmark" is intentionally not shown — only nearby context.
  const categoryItems: {
    key: string;
    label: string;
    text: string;
    icon: ReactNode;
    tone: "when" | "where";
  }[] = [];
  if (data) {
    const push = (
      key: string,
      label: string,
      item: LearnClueItem | null,
      tone: "when" | "where",
      icon: ReactNode
    ) => {
      if (item) {
        categoryItems.push({ key, label, text: clueText(item, tone), icon, tone });
      }
    };
    push("contemporary", t("hint_contemporary_event"), data.contemporaryEvent, "when", <Calendar size={14} />);
    push("nearby", t("hint_nearby_landmark"), data.nearbyLandmark, "where", <Landmark size={14} />);
  }
  const timeline = data?.timeline ?? [];
  const mapPoints = data?.mapPoints ?? [];

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
          <div className={styles.title}>
            <BookOpen size={16} />
            {t("learn_title")}
          </div>
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

        {data?.title ? (
          <h2 className={styles.eventTitleBar}>{data.title}</h2>
        ) : null}

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
            <section className={`${styles.card} ${styles.cardStory}`}>
              <div className={styles.cardHead}>
                <span className={styles.iconBadge}>
                  <BookOpen size={16} />
                </span>
                <h3 className={styles.cardTitle}>{t("learn_what_happened")}</h3>
              </div>
              <p className={styles.description}>{whatHappened}</p>
            </section>
          ) : null}

          {data ? (
            <>
              {yearItems.length > 0 ? (
                <section className={`${styles.card} ${styles.cardWhen}`}>
                  <div className={styles.cardHead}>
                    <span className={styles.iconBadge}>
                      <Calendar size={16} />
                    </span>
                    <h3 className={styles.cardTitle}>{t("learn_find_year")}</h3>
                  </div>
                  <ul className={styles.clueList}>
                    {yearItems.map((item, i) => (
                      <li key={i} className={styles.clue}>
                        <Check size={14} className={styles.clueIcon} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {locationItems.length > 0 ? (
                <section className={`${styles.card} ${styles.cardWhere}`}>
                  <div className={styles.cardHead}>
                    <span className={styles.iconBadge}>
                      <MapPin size={16} />
                    </span>
                    <h3 className={styles.cardTitle}>
                      {t("learn_find_location")}
                    </h3>
                  </div>
                  <ul className={styles.clueList}>
                    {locationItems.map((item, i) => (
                      <li key={i} className={styles.clue}>
                        <Check size={14} className={styles.clueIcon} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {categoryItems.length > 0 ? (
                <section className={`${styles.card} ${styles.cardNear}`}>
                  <div className={styles.cardHead}>
                    <span className={styles.iconBadge}>
                      <Link2 size={16} />
                    </span>
                    <h3 className={styles.cardTitle}>{t("learn_related_to")}</h3>
                  </div>
                  <ul className={styles.miniGrid}>
                    {categoryItems.map((c) => (
                      <li
                        key={c.key}
                        className={`${styles.miniCard} ${
                          c.tone === "when" ? styles.miniWhen : styles.miniWhere
                        }`}
                      >
                        <span className={styles.miniLabel}>
                          {c.icon}
                          {c.label}
                        </span>
                        <span className={styles.miniText}>{c.text}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {timeline.length > 1 ? (
                <section className={`${styles.card} ${styles.cardTimeline}`}>
                  <div className={styles.cardHead}>
                    <span className={styles.iconBadge}>
                      <History size={16} />
                    </span>
                    <h3 className={styles.cardTitle}>
                      {t("learn_related_events")}
                    </h3>
                  </div>
                  <ol className={styles.timeline}>
                    {timeline.map((item) => (
                      <li
                        key={item.id}
                        className={`${styles.tlItem} ${
                          item.isCurrent ? styles.tlCurrent : ""
                        }`}
                        aria-current={item.isCurrent ? "true" : undefined}
                      >
                        <span className={styles.tlYear}>
                          {yearLabel(item.year)}
                        </span>
                        <span className={styles.tlDot} aria-hidden="true" />
                        <span className={styles.tlBody}>
                          {item.isCurrent ? (
                            <span className={styles.tlBadge}>
                              {t("learn_this_event")}
                            </span>
                          ) : null}
                          <span className={styles.tlTitle}>{item.title}</span>
                          {item.location ? (
                            <span className={styles.eventLoc}>
                              <MapPin size={11} />
                              {item.location}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}

              {mapPoints.length > 0 ? (
                <section className={`${styles.card} ${styles.cardMap}`}>
                  <div className={styles.cardHead}>
                    <span className={styles.iconBadge}>
                      <MapIcon size={16} />
                    </span>
                    <h3 className={styles.cardTitle}>
                      {t("learn_related_location")}
                    </h3>
                  </div>
                  <div className={styles.mapWrap}>
                    <LearnLocationMap
                      points={mapPoints}
                      yearLabel={yearLabel}
                      activeId={activeId}
                      onSelect={setActiveId}
                    />
                  </div>
                  <ul className={styles.miniGrid}>
                    {mapPoints.map((p, i) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className={`${styles.eventCard} ${styles.pointBtn} ${
                            p.id === activeId ? styles.pointActive : ""
                          }`}
                          aria-pressed={p.id === activeId}
                          style={{
                            ["--point-color" as string]: pointColor(
                              p.isCurrent,
                              i - 1
                            ),
                          }}
                          onClick={() => setActiveId(p.id)}
                        >
                          <span className={styles.pointDot} aria-hidden="true" />
                          <span className={styles.eventBody}>
                            <span className={styles.eventTitle}>
                              {p.title} · {yearLabel(p.year)}
                            </span>
                            {p.location ? (
                              <span className={styles.eventLoc}>
                                <MapPin size={11} />
                                {p.location}
                              </span>
                            ) : null}
                          </span>
                          <span className={styles.kmChip}>
                            {p.isCurrent
                              ? t("learn_this_event")
                              : formatDistance(p.km, distanceUnit)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
