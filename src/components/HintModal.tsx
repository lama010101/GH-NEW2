"use client";

import { useEffect, useState, useMemo } from "react";
import { useTranslations } from 'next-intl';
import { formatDistance, getDistanceUnitPreference, type DistanceUnit } from "@/lib/distance";
import type { EventHint } from "@/core/types";
import WhereIcon from "@/components/icons/WhereIcon";
import WhenIcon from "@/components/icons/WhenIcon";
import styles from "./HintModal.module.css";

export type HintPurchaseResult = {
  purchasedIds: string[];
  accPenalty: number;
  xpPenalty: number;
  whereAccPenalty: number;
  whenAccPenalty: number;
};

export type HintModalProps = {
  hints: EventHint[];
  isOpen: boolean;
  onClose: (result: HintPurchaseResult) => void;
  purchasedIds: string[];
};

// Tier penalty mapping (spec-authoritative)
const TIER_PENALTIES = {
  1: { acc: 30, xp: 60 },
  2: { acc: 20, xp: 40 },
  3: { acc: 50, xp: 100 },
  4: { acc: 40, xp: 80 },
  5: { acc: 50, xp: 100 },
} as const;

// Icon SVG strings (from reference HTML)
const ICONS = {
  calendar: `<svg viewBox="0 0 13 13" fill="none"><rect x="1.2" y="2" width="10.6" height="10" rx="1.5" stroke="currentColor" stroke-width="1.1"/><path d="M4.3 1v2M8.7 1v2M1.2 5.3h10.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`,
  clock: `<svg viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.1"/><path d="M6.5 3.5v3l2 1.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`,
  trend: `<svg viewBox="0 0 13 13" fill="none"><path d="M2 9.5l3-4 2.5 2 4-5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  ruler: `<svg viewBox="0 0 13 13" fill="none"><rect x="1" y="5" width="11" height="3" rx="1" stroke="currentColor" stroke-width="1.1"/><path d="M3.5 5V3.5M6.5 5V4M9.5 5V3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`,
  tag: `<svg viewBox="0 0 13 13" fill="none"><path d="M2 2h5l4.5 4.5a1 1 0 010 1.4l-3.1 3.1a1 1 0 01-1.4 0L2.5 6.5V2H2z" stroke="currentColor" stroke-width="1.1"/><circle cx="4.5" cy="4.5" r=".8" fill="currentColor"/></svg>`,
  globe: `<svg viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.1"/><path d="M1.5 6.5h10M6.5 1.5c-2 2-2 8 0 10M6.5 1.5c2 2-2 8 0 10" stroke="currentColor" stroke-width="1.1"/></svg>`,
  mountain: `<svg viewBox="0 0 13 13" fill="none"><path d="M1.5 10.5l4-7 2.5 4 1.5-2 3 5H1.5z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>`,
  flag: `<svg viewBox="0 0 13 13" fill="none"><path d="M3 11V2M3 2h7.5L8.5 5.5 10.5 9H3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  lock: `<svg viewBox="0 0 10 10" fill="none"><rect x="1.5" y="4.5" width="7" height="5" rx="1" stroke="currentColor" stroke-width="1.1"/><path d="M3 4.5V3a2 2 0 014 0v1.5" stroke="currentColor" stroke-width="1.1"/></svg>`,
  check: `<svg viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2.5 2.5 4-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
} as const;

type TabType = "when" | "where";

function getHintLabel(hint: EventHint, t: (key: string) => string): string {
  if (hint.type === "when") {
    if (hint.tier === 1) return t('hint_century');
    if (hint.tier === 2) return t('hint_historical_event');
    if (hint.tier === 3) return t('hint_decade');
    if (hint.tier === 4) return t('hint_contemporary_event');
    if (hint.tier === 5) return t('hint_visual_clues');
  }
  if (hint.type === "where") {
    if (hint.tier === 1) return t('hint_continent');
    if (hint.tier === 2) return t('hint_remote_landmark');
    if (hint.tier === 3) return t('hint_region');
    if (hint.tier === 4) return t('hint_nearby_landmark');
    if (hint.tier === 5) return t('hint_visual_clues');
  }
  return t('hint_label_default');
}

function penaltyBorderColor(pct: number): string {
  if (pct === 0) return "transparent";
  if (pct <= 20) return "rgba(var(--gh-success-rgb), 0.4)";
  if (pct <= 40) return "rgba(var(--gh-gold-rgb), 0.4)";
  if (pct <= 60) return "rgba(var(--gh-orange-rgb), 0.4)";
  return "rgba(var(--gh-danger-rgb), 0.4)";
}

function getHintDescription(hint: EventHint, t: (key: string, params?: Record<string, string | number | Date>) => string, unit: DistanceUnit): string {
  if (hint.type === "when") {
    if (hint.tier === 1) return t('hint_desc_broad_era');
    if (hint.tier === 2) return t('hint_desc_nearby_event');
    if (hint.tier === 3) return t('hint_desc_decade_window');
    if (hint.tier === 4) return t('hint_desc_dated_event');
    if (hint.tier === 5) return t('hint_desc_era_scene');
  }
  if (hint.type === "where") {
    if (hint.tier === 1) return t('hint_desc_broad_region');
    if (hint.tier === 2) {
      const km = (hint.metadata as { km?: number } | null)?.km;
      return km != null ? t('hint_desc_distant_landmark_km', { distance: formatDistance(km, unit) }) : t('hint_desc_distant_landmark');
    }
    if (hint.tier === 3) return t('hint_desc_admin_region');
    if (hint.tier === 4) {
      const km = (hint.metadata as { km?: number } | null)?.km;
      return km != null ? t('hint_desc_nearby_landmark_km', { distance: formatDistance(km, unit) }) : t('hint_desc_nearby_landmark');
    }
    if (hint.tier === 5) return t('hint_desc_location_scene');
  }
  return t('hint_desc_tap_reveal');
}

function getIcon(hint: EventHint): string {
  if (hint.type === "when") {
    if (hint.tier === 1) return ICONS.clock;
    if (hint.tier === 2) return ICONS.trend;
    if (hint.tier === 3) return ICONS.calendar;
    if (hint.tier === 4) return ICONS.trend;
    if (hint.tier === 5) return ICONS.tag;
  }
  if (hint.type === "where") {
    if (hint.tier === 1) return ICONS.globe;
    if (hint.tier === 2) return ICONS.mountain;
    if (hint.tier === 3) return ICONS.flag;
    if (hint.tier === 4) return ICONS.mountain;
    if (hint.tier === 5) return ICONS.tag;
  }
  return ICONS.calendar;
}

function getRevealedText(hint: EventHint, t: (key: string, values?: Record<string, string | number | Date>) => string, unit: DistanceUnit): string {
  const meta = hint.metadata as { km?: number; years?: number | string } | null;

  if (hint.type === "where") {
    if ((hint.tier === 2 || hint.tier === 4) && meta?.km != null) {
      return `${hint.content} — ${t('km_away_short', { distance: formatDistance(meta.km, unit) })}`;
    }
  }

  if (hint.type === "when") {
    if ((hint.tier === 2 || hint.tier === 4) && meta?.years != null) {
      return `${hint.content} — ${t('years_off_short', { n: meta.years })}`;
    }
  }

  return hint.content;
}

export function HintModal({ hints, isOpen, onClose, purchasedIds }: HintModalProps) {
  const t = useTranslations('game');
  const distanceUnit = getDistanceUnitPreference();
  const [purchased, setPurchased] = useState<Set<string>>(new Set(purchasedIds));
  const [activeTab, setActiveTab] = useState<TabType>("when");

  // Reset purchased set when modal opens
  useEffect(() => {
    if (isOpen) {
      setPurchased(new Set(purchasedIds));
      setActiveTab("when");
    }
  }, [isOpen, purchasedIds]);

  // Get cost pill CSS module class based on actual penalty rate
  const getCostClass = (rate: number): string => {
    if (rate <= 10) return styles.costG;
    if (rate <= 20) return styles.costY;
    if (rate <= 40) return styles.costO;
    return styles.costR;
  };

  // Get penalty color CSS module class
  const getPenaltyColor = (pct: number): string => {
    if (pct === 0) return styles.zero;
    if (pct <= 20) return styles.g;
    if (pct <= 40) return styles.y;
    if (pct <= 60) return styles.o;
    return styles.r;
  };

  // Calculate penalties
  const penalties = useMemo(() => {
    const whenHints = hints.filter((h) => h.type === "when");
    const whereHints = hints.filter((h) => h.type === "where");

    const whenAcc = whenHints.reduce((sum, h) => {
      return purchased.has(h.id) ? sum + TIER_PENALTIES[h.tier as keyof typeof TIER_PENALTIES].acc : sum;
    }, 0);

    const whereAcc = whereHints.reduce((sum, h) => {
      return purchased.has(h.id) ? sum + TIER_PENALTIES[h.tier as keyof typeof TIER_PENALTIES].acc : sum;
    }, 0);

    const totalAcc = hints.reduce((sum, h) => {
      return purchased.has(h.id) ? sum + TIER_PENALTIES[h.tier as keyof typeof TIER_PENALTIES].acc : sum;
    }, 0);

    const totalXp = hints.reduce((sum, h) => {
      return purchased.has(h.id) ? sum + TIER_PENALTIES[h.tier as keyof typeof TIER_PENALTIES].xp : sum;
    }, 0);

    return {
      whenAcc: Math.min(whenAcc, 100),
      whereAcc: Math.min(whereAcc, 100),
      totalAcc: Math.min(totalAcc, 100),
      totalXp: Math.min(totalXp, 200),
    };
  }, [hints, purchased]);

  // Get hints for active tab, sorted by rate ascending, then tier ascending
  const activeHints = useMemo(() => {
    return hints
      .filter((h) => h.type === activeTab)
      .sort((a, b) => {
        const aRate = TIER_PENALTIES[a.tier as keyof typeof TIER_PENALTIES].acc;
        const bRate = TIER_PENALTIES[b.tier as keyof typeof TIER_PENALTIES].acc;
        if (aRate !== bRate) return aRate - bRate;
        return a.tier - b.tier;
      });
  }, [hints, activeTab]);

  // Get purchased count for a tab
  const getPurchasedCount = (tab: TabType): number => {
    return hints.filter((h) => h.type === tab && purchased.has(h.id)).length;
  };

  // Handle hint purchase
  const handlePurchase = (hintId: string) => {
    setPurchased((prev) => new Set([...prev, hintId]));
  };

  // Handle close
  const handleClose = () => {
    onClose({
      purchasedIds: Array.from(purchased),
      accPenalty: penalties.totalAcc,
      xpPenalty: penalties.totalXp,
      whereAccPenalty: penalties.whereAcc,
      whenAccPenalty: penalties.whenAcc,
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={handleClose}>
        <div
          className={`${styles.modal} ${styles.root}`}
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.title}>{t('hints')}</div>
            <button
              className={styles.closeBtn}
              onClick={handleClose}
              aria-label={t('close_hints')}
            >
              <svg viewBox="0 0 10 10" fill="none">
                <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" />
              </svg>
            </button>
          </div>

          {/* Total Penalty Strip */}
          <div className={styles.totalStrip}>
            <div className={styles.totalLeft}>
              <div className={styles.totalLbl}>{t('total_penalty')}</div>
              <div className={`${styles.totalBig} ${getPenaltyColor(penalties.totalAcc)}`}>
                −{penalties.totalAcc}%
              </div>
            </div>
            <div className={styles.totalRight}>
              {/* When Axis */}
              <div className={styles.axisPen} style={{ borderColor: penaltyBorderColor(penalties.whenAcc) }}>
                <div className={styles.axisIcon}>
                  <svg viewBox="0 0 10 10" fill="none">
                    <rect x="1" y="1.5" width="8" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
                    <path d="M3.5 1v1.5M6.5 1v1.5M1 4h8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                  </svg>
                  <span className={styles.axisLbl}>When</span>
                </div>
                <div className={`${styles.axisVal} ${getPenaltyColor(penalties.whenAcc)}`}>
                  −{penalties.whenAcc}%
                </div>
                <div className={styles.axisTrack}>
                  <div className={styles.axisFill} style={{ width: `${penalties.whenAcc}%` }} />
                </div>
              </div>
              {/* Where Axis */}
              <div className={styles.axisPen} style={{ borderColor: penaltyBorderColor(penalties.whereAcc) }}>
                <div className={styles.axisIcon}>
                  <svg viewBox="0 0 10 10" fill="none">
                    <path d="M5 1C3.62 1 2.5 2.12 2.5 3.5c0 1.88 2.5 5.5 2.5 5.5s2.5-3.62 2.5-5.5C7.5 2.12 6.38 1 5 1zm0 3.33a.83.83 0 110-1.66.83.83 0 010 1.66z" fill="currentColor" />
                  </svg>
                  <span className={styles.axisLbl}>Where</span>
                </div>
                <div className={`${styles.axisVal} ${getPenaltyColor(penalties.whereAcc)}`}>
                  −{penalties.whereAcc}%
                </div>
                <div className={styles.axisTrack}>
                  <div className={styles.axisFill} style={{ width: `${penalties.whereAcc}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className={styles.tabRow}>
            <button
              className={`${styles.tabBtn} ${styles.tabBtnWhen} ${activeTab === "when" ? styles.active : ""}`}
              onClick={() => setActiveTab("when")}
            >
              <WhenIcon className={styles.tabIcon} size={22} />
              <span className={styles.tabLbl}>When</span>
              {getPurchasedCount("when") > 0 && (
                <div className={styles.tabBadge}>{getPurchasedCount("when")}</div>
              )}
            </button>
            <button
              className={`${styles.tabBtn} ${styles.tabBtnWhere} ${activeTab === "where" ? styles.active : ""}`}
              onClick={() => setActiveTab("where")}
            >
              <WhereIcon className={styles.tabIcon} size={22} />
              <span className={styles.tabLbl}>Where</span>
              {getPurchasedCount("where") > 0 && (
                <div className={styles.tabBadge}>{getPurchasedCount("where")}</div>
              )}
            </button>
          </div>

          {/* Hints List */}
          <div className={styles.hintsPanel}>
            {activeHints.map((hint) => {
              const owned = purchased.has(hint.id);
              const tierPenalty = TIER_PENALTIES[hint.tier as keyof typeof TIER_PENALTIES];

              return (
                <button
                  key={hint.id}
                  className={`${styles.hintBtn} ${owned ? styles.revealed : ""}`}
                  onClick={() => !owned && handlePurchase(hint.id)}
                  disabled={owned}
                  aria-pressed={owned}
                >
                  {/* Icon */}
                  <div className={styles.hintIcon} dangerouslySetInnerHTML={{ __html: getIcon(hint) }} />

                  {/* Body */}
                  <div className={styles.hintBody}>
                    <div className={styles.hintName}>{getHintLabel(hint, t)}</div>
                    {owned ? (
                      <div className={styles.hintAnswer}>{getRevealedText(hint, t, distanceUnit)}</div>
                    ) : (
                      <div className={styles.hintSub}>{getHintDescription(hint, t, distanceUnit)}</div>
                    )}
                  </div>

                  {/* Right side */}
                  <div className={styles.hintRight}>
                    {owned ? (
                      <div className={styles.checkDot} dangerouslySetInnerHTML={{ __html: ICONS.check }} />
                    ) : (
                      <div className={`${styles.costPill} ${getCostClass(tierPenalty.acc)}`}>
                        −{tierPenalty.acc}%
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
