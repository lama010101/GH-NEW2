"use client";

import { useEffect, useState, useMemo } from "react";
import type { EventHint } from "@/core/types";

export type HintPurchaseResult = {
  purchasedIds: string[];
  accPenalty: number;
  xpPenalty: number;
};

export type HintModalProps = {
  hints: EventHint[];
  isOpen: boolean;
  onClose: (result: HintPurchaseResult) => void;
  purchasedIds: string[];
};

// Tier penalty mapping (spec-authoritative)
const TIER_PENALTIES = {
  1: { acc: 10, xp: 20 },
  2: { acc: 20, xp: 40 },
  3: { acc: 30, xp: 60 },
  4: { acc: 40, xp: 80 },
  5: { acc: 50, xp: 100 },
} as const;

// Icon SVG strings (from reference HTML)
const ICONS = {
  calendar: `<svg viewBox="0 0 13 13" fill="none"><rect x="1.2" y="2" width="10.6" height="10" rx="1.5" stroke="#888" stroke-width="1.1"/><path d="M4.3 1v2M8.7 1v2M1.2 5.3h10.6" stroke="#888" stroke-width="1.1" stroke-linecap="round"/></svg>`,
  clock: `<svg viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="#888" stroke-width="1.1"/><path d="M6.5 3.5v3l2 1.5" stroke="#888" stroke-width="1.1" stroke-linecap="round"/></svg>`,
  trend: `<svg viewBox="0 0 13 13" fill="none"><path d="M2 9.5l3-4 2.5 2 4-5" stroke="#888" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  ruler: `<svg viewBox="0 0 13 13" fill="none"><rect x="1" y="5" width="11" height="3" rx="1" stroke="#888" stroke-width="1.1"/><path d="M3.5 5V3.5M6.5 5V4M9.5 5V3.5" stroke="#888" stroke-width="1.1" stroke-linecap="round"/></svg>`,
  tag: `<svg viewBox="0 0 13 13" fill="none"><path d="M2 2h5l4.5 4.5a1 1 0 010 1.4l-3.1 3.1a1 1 0 01-1.4 0L2.5 6.5V2H2z" stroke="#888" stroke-width="1.1"/><circle cx="4.5" cy="4.5" r=".8" fill="#888"/></svg>`,
  globe: `<svg viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="#888" stroke-width="1.1"/><path d="M1.5 6.5h10M6.5 1.5c-2 2-2 8 0 10M6.5 1.5c2 2-2 8 0 10" stroke="#888" stroke-width="1.1"/></svg>`,
  mountain: `<svg viewBox="0 0 13 13" fill="none"><path d="M1.5 10.5l4-7 2.5 4 1.5-2 3 5H1.5z" stroke="#888" stroke-width="1.1" stroke-linejoin="round"/></svg>`,
  flag: `<svg viewBox="0 0 13 13" fill="none"><path d="M3 11V2M3 2h7.5L8.5 5.5 10.5 9H3" stroke="#888" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  lock: `<svg viewBox="0 0 10 10" fill="none"><rect x="1.5" y="4.5" width="7" height="5" rx="1" stroke="#888" stroke-width="1.1"/><path d="M3 4.5V3a2 2 0 014 0v1.5" stroke="#888" stroke-width="1.1"/></svg>`,
  check: `<svg viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2.5 2.5 4-5" stroke="#7ed957" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
} as const;

type TabType = "when" | "where";

function getHintLabel(hint: EventHint): string {
  if (hint.type === "when") {
    if (hint.tier === 1) return "Century";
    if (hint.tier === 2) return "Historical Event";
    if (hint.tier === 3) return "Decade";
    if (hint.tier === 4) return "Contemporary Event";
    if (hint.tier === 5) return "Visual Clues";
  }
  if (hint.type === "where") {
    if (hint.tier === 1) return "Continent";
    if (hint.tier === 2) return "Remote Landmark";
    if (hint.tier === 3) return "Region";
    if (hint.tier === 4) return "Nearby Landmark";
    if (hint.tier === 5) return "Visual Clues";
  }
  return "Hint";
}

function penaltyBorderColor(pct: number): string {
  if (pct === 0) return "#2a2a2a";
  if (pct <= 20) return "rgba(126,217,87,0.4)";
  if (pct <= 40) return "rgba(232,192,34,0.4)";
  if (pct <= 60) return "rgba(232,119,34,0.4)";
  return "rgba(232,68,34,0.4)";
}

function getHintDescription(hint: EventHint): string {
  if (hint.type === "when") {
    if (hint.tier === 1) return "Broad era clue";
    if (hint.tier === 2) return "A historically nearby event";
    if (hint.tier === 3) return "A 10-year window";
    if (hint.tier === 4) return "A closely dated event";
    if (hint.tier === 5) return "Scene elements suggesting the era";
  }
  if (hint.type === "where") {
    if (hint.tier === 1) return "Broad region clue";
    if (hint.tier === 2) {
      const km = (hint.metadata as { km?: number } | null)?.km;
      return km != null ? `A landmark ~${km} km away` : "A distant landmark";
    }
    if (hint.tier === 3) return "Administrative region";
    if (hint.tier === 4) {
      const km = (hint.metadata as { km?: number } | null)?.km;
      return km != null ? `A landmark ~${km} km away` : "A nearby landmark";
    }
    if (hint.tier === 5) return "Scene elements suggesting the location";
  }
  return "Tap to reveal";
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

function getRevealedText(hint: EventHint): string {
  const meta = hint.metadata as { km?: number; years?: number | string } | null;

  if (hint.type === "where") {
    if ((hint.tier === 2 || hint.tier === 4) && meta?.km != null) {
      return `${hint.content} — ${meta.km} km away`;
    }
  }

  if (hint.type === "when") {
    if ((hint.tier === 2 || hint.tier === 4) && meta?.years != null) {
      return `${hint.content} — ${meta.years} years off`;
    }
  }

  return hint.content;
}

export function HintModal({ hints, isOpen, onClose, purchasedIds }: HintModalProps) {
  const [purchased, setPurchased] = useState<Set<string>>(new Set(purchasedIds));
  const [activeTab, setActiveTab] = useState<TabType>("when");

  // Reset purchased set when modal opens
  useEffect(() => {
    if (isOpen) {
      setPurchased(new Set(purchasedIds));
      setActiveTab("when");
    }
  }, [isOpen, purchasedIds]);

  // Get cost pill color class
  const getCostClass = (tier: number): string => {
    if (tier === 1) return "hint-cost-g";
    if (tier === 2) return "hint-cost-y";
    if (tier <= 4) return "hint-cost-o";
    return "hint-cost-r";
  };

  // Get penalty color class
  const getPenaltyColor = (pct: number): string => {
    if (pct === 0) return "zero";
    if (pct <= 20) return "g";
    if (pct <= 40) return "y";
    if (pct <= 60) return "o";
    return "r";
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

  // Get hints for active tab, sorted by display_order then tier
  const activeHints = useMemo(() => {
    return hints
      .filter((h) => h.type === activeTab)
      .sort((a, b) => {
        if (a.display_order !== b.display_order) return a.display_order - b.display_order;
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
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        .hint-modal-root {
          --modal-bg: #111;
          --modal-surface: #1a1a1a;
          --modal-surface2: #141414;
          --modal-surface3: #1e1e1e;
          --modal-border: #1e1e1e;
          --modal-border-md: #252525;
          --modal-border-hi: #333;
          --modal-text: #fff;
          --modal-text-dim: #bbb;
          --modal-text-muted: #666;
          --modal-g: #7ed957;
          --modal-y: #e8c022;
          --modal-o: #E87722;
          --modal-r: #e84422;
        }
        /* TODO: light theme — add .light class overrides when theme system is implemented */
        .hint-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .hint-modal {
          width: 100%;
          max-width: 460px;
          background: var(--modal-bg);
          border-radius: 16px;
          border: 0.5px solid var(--modal-border-md);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          color: var(--modal-text);
        }
        .hint-modal-header {
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 0.5px solid var(--modal-border);
        }
        .hint-modal-title {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          font-weight: 700;
          font-size: 14px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--modal-text);
        }
        .hint-modal-close {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: #2a2a2a;
          border: 0.5px solid #444;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .hint-modal-close svg {
          width: 10px;
          height: 10px;
        }
        .hint-total-strip {
          padding: 16px 18px 14px;
          border-bottom: 0.5px solid var(--modal-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .hint-total-left {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .hint-total-lbl {
          font-size: 10px;
          font-weight: 500;
          color: #999;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .hint-total-big {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          font-weight: 800;
          font-size: 38px;
          line-height: 1;
          color: var(--modal-g);
        }
        .hint-total-big.y { color: var(--modal-y); }
        .hint-total-big.o { color: var(--modal-o); }
        .hint-total-big.r { color: var(--modal-r); }
        .hint-total-big.zero { color: #333; }
        .hint-total-right {
          display: flex;
          gap: 10px;
        }
        .hint-axis-pen {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          background: transparent;
          border: 0.5px solid transparent;
          border-radius: 10px;
          padding: 8px 12px;
        }
        .hint-axis-icon {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .hint-axis-icon svg {
          width: 10px;
          height: 10px;
          flex-shrink: 0;
        }
        .hint-axis-lbl {
          font-size: 9px;
          font-weight: 500;
          color: #999;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }
        .hint-axis-val {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          font-weight: 700;
          font-size: 15px;
          line-height: 1;
          color: var(--modal-text);
        }
        .hint-axis-val--zero { color: #333; }
        .hint-axis-val--g { color: #7ed957; }
        .hint-axis-val--y { color: #e8c022; }
        .hint-axis-val--o { color: #E87722; }
        .hint-axis-val--r { color: #e84422; }
        .hint-axis-track {
          width: 56px;
          height: 2px;
          background: #1e1e1e;
          border-radius: 2px;
          overflow: hidden;
          margin-top: 3px;
        }
        .hint-axis-fill {
          height: 100%;
          border-radius: 2px;
          background: #fff;
          transition: width 0.25s ease;
        }
        .hint-tab-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          margin: 12px 14px 0;
          background: transparent;
          border-radius: 0;
          padding: 0;
          border: none;
          border-bottom: 0.5px solid #2a2a2a;
        }
        .hint-tab-btn {
          padding: 9px 0;
          border-radius: 0;
          border: none;
          border-bottom: 2px solid transparent;
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: color 0.15s;
        }
        .hint-tab-btn.active {
          background: transparent;
          border: none;
          border-bottom: 2px solid #f97316;
          border-radius: 0;
        }
        .hint-tab-lbl {
          font-size: 13px;
          font-weight: 500;
          color: #666;
        }
        .hint-tab-btn.active .hint-tab-lbl {
          color: #f97316;
          font-weight: 600;
        }
        .hint-tab-btn svg path,
        .hint-tab-btn svg rect,
        .hint-tab-btn svg circle {
          stroke: #666;
        }
        .hint-tab-btn.active svg path,
        .hint-tab-btn.active svg rect,
        .hint-tab-btn.active svg circle {
          stroke: #f97316;
        }
        .hint-tab-badge {
          margin-left: 2px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--modal-surface);
          border: 0.5px solid var(--modal-border-md);
          font-size: 9px;
          font-weight: 700;
          color: var(--modal-text-muted);
          display: none;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        }
        .hint-hints-panel {
          padding: 10px 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 5px;
          max-height: 380px;
          overflow-y: auto;
        }
        .hint-hints-panel::-webkit-scrollbar {
          width: 2px;
        }
        .hint-hints-panel::-webkit-scrollbar-thumb {
          background: #222;
          border-radius: 2px;
        }
        .hint-btn {
          background: #2a2a2a;
          border: 0.5px solid #383838;
          border-radius: 10px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          transition: border-color 0.12s, background 0.12s, transform 0.08s;
          position: relative;
          overflow: hidden;
          text-align: left;
          width: 100%;
        }
        .hint-btn:hover:not(.revealed) {
          background: #333;
          border-color: #444;
          transform: translateY(-1px);
        }
        .hint-btn:active:not(.revealed) {
          transform: translateY(0);
        }
        .hint-btn.revealed {
          border-color: rgba(126, 217, 87, 0.25);
          background: rgba(126, 217, 87, 0.06);
          cursor: default;
        }
        .hint-btn.revealed::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: #7ed957;
        }
        .hint-icon {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: #333;
          border: 0.5px solid #444;
          transition: background 0.12s;
        }
        .hint-icon svg {
          width: 13px;
          height: 13px;
        }
        .hint-btn:hover:not(.revealed) .hint-icon {
          background: #222;
        }
        .hint-body {
          flex: 1;
          min-width: 0;
        }
        .hint-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--modal-text);
          margin-bottom: 2px;
          line-height: 1.3;
        }
        .hint-btn.revealed .hint-name {
          color: #fff;
        }
        .hint-sub {
          font-size: 11px;
          color: #999;
          line-height: 1.4;
        }
        .hint-answer {
          font-size: 12px;
          color: var(--modal-text-dim);
          line-height: 1.45;
          font-style: italic;
          margin-top: 2px;
        }
        .hint-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 3px;
          flex-shrink: 0;
        }
        .hint-cost-pill {
          display: flex;
          align-items: center;
          padding: 3px 8px;
          border-radius: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          font-weight: 700;
          font-size: 11px;
          border: 0.5px solid;
          letter-spacing: 0.02em;
          transition: opacity 0.12s;
        }
        .hint-cost-g {
          background: rgba(126, 217, 87, 0.10);
          border-color: rgba(126, 217, 87, 0.3);
          color: var(--modal-g);
        }
        .hint-cost-y {
          background: rgba(232, 192, 34, 0.10);
          border-color: rgba(232, 192, 34, 0.3);
          color: var(--modal-y);
        }
        .hint-cost-o {
          background: rgba(232, 119, 34, 0.10);
          border-color: rgba(232, 119, 34, 0.3);
          color: var(--modal-o);
        }
        .hint-cost-r {
          background: rgba(232, 68, 34, 0.10);
          border-color: rgba(232, 68, 34, 0.3);
          color: var(--modal-r);
        }
        .hint-check-dot {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: rgba(126, 217, 87, 0.15);
          border: 0.5px solid rgba(126, 217, 87, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .hint-check-dot svg {
          width: 9px;
          height: 9px;
        }
      `}</style>
      <div className="hint-modal-backdrop" onClick={handleClose}>
        <div
          className="hint-modal hint-modal-root"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="hint-modal-header">
            <div className="hint-modal-title">Hints</div>
            <button
              className="hint-modal-close"
              onClick={handleClose}
              aria-label="Close hints"
            >
              <svg viewBox="0 0 10 10" fill="none">
                <path d="M2 2l6 6M8 2L2 8" stroke="#aaa" />
              </svg>
            </button>
          </div>

          {/* Total Penalty Strip */}
          <div className="hint-total-strip">
            <div className="hint-total-left">
              <div className="hint-total-lbl">Total penalty</div>
              <div className={`hint-total-big ${getPenaltyColor(penalties.totalAcc)}`}>
                −{penalties.totalAcc}%
              </div>
            </div>
            <div className="hint-total-right">
              {/* When Axis */}
              <div className="hint-axis-pen" style={{ borderColor: penaltyBorderColor(penalties.whenAcc) }}>
                <div className="hint-axis-icon">
                  <svg viewBox="0 0 10 10" fill="none">
                    <rect x="1" y="1.5" width="8" height="7.5" rx="1.2" stroke="#555" strokeWidth="1.1" />
                    <path d="M3.5 1v1.5M6.5 1v1.5M1 4h8" stroke="#555" strokeWidth="1.1" strokeLinecap="round" />
                  </svg>
                  <span className="hint-axis-lbl">When</span>
                </div>
                <div className={`hint-axis-val hint-axis-val--${getPenaltyColor(penalties.whenAcc)}`}>
                  −{penalties.whenAcc}%
                </div>
                <div className="hint-axis-track">
                  <div className="hint-axis-fill" style={{ width: `${penalties.whenAcc}%` }} />
                </div>
              </div>
              {/* Where Axis */}
              <div className="hint-axis-pen" style={{ borderColor: penaltyBorderColor(penalties.whereAcc) }}>
                <div className="hint-axis-icon">
                  <svg viewBox="0 0 10 10" fill="none">
                    <path d="M5 1C3.62 1 2.5 2.12 2.5 3.5c0 1.88 2.5 5.5 2.5 5.5s2.5-3.62 2.5-5.5C7.5 2.12 6.38 1 5 1zm0 3.33a.83.83 0 110-1.66.83.83 0 010 1.66z" fill="#555" />
                  </svg>
                  <span className="hint-axis-lbl">Where</span>
                </div>
                <div className={`hint-axis-val hint-axis-val--${getPenaltyColor(penalties.whereAcc)}`}>
                  −{penalties.whereAcc}%
                </div>
                <div className="hint-axis-track">
                  <div className="hint-axis-fill" style={{ width: `${penalties.whereAcc}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="hint-tab-row">
            <button
              className={`hint-tab-btn ${activeTab === "when" ? "active" : ""}`}
              onClick={() => setActiveTab("when")}
            >
              <svg viewBox="0 0 12 12" fill="none" width="12" height="12">
                <rect x="1.5" y="2" width="9" height="9" rx="1.5" strokeWidth="1.2" />
                <path d="M4 1v2M8 1v2M1.5 5h9" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <span className="hint-tab-lbl">When</span>
              {getPurchasedCount("when") > 0 && (
                <div className="hint-tab-badge">{getPurchasedCount("when")}</div>
              )}
            </button>
            <button
              className={`hint-tab-btn ${activeTab === "where" ? "active" : ""}`}
              onClick={() => setActiveTab("where")}
            >
              <svg viewBox="0 0 12 12" fill="none" width="12" height="12">
                <path d="M6 1C4.34 1 3 2.34 3 4c0 2.25 3 7 3 7s3-4.75 3-7c0-1.66-1.34-3-3-3zm0 4a1 1 0 110-2 1 1 0 010 2z" strokeWidth="1.2" />
              </svg>
              <span className="hint-tab-lbl">Where</span>
              {getPurchasedCount("where") > 0 && (
                <div className="hint-tab-badge">{getPurchasedCount("where")}</div>
              )}
            </button>
          </div>

          {/* Hints List */}
          <div className="hint-hints-panel">
            {activeHints.map((hint) => {
              const owned = purchased.has(hint.id);
              const tierPenalty = TIER_PENALTIES[hint.tier as keyof typeof TIER_PENALTIES];

              return (
                <button
                  key={hint.id}
                  className={`hint-btn ${owned ? "revealed" : ""}`}
                  onClick={() => !owned && handlePurchase(hint.id)}
                  disabled={owned}
                  aria-pressed={owned}
                >
                  {/* Icon */}
                  <div className="hint-icon" dangerouslySetInnerHTML={{ __html: getIcon(hint) }} />

                  {/* Body */}
                  <div className="hint-body">
                    <div className="hint-name">{getHintLabel(hint)}</div>
                    {owned ? (
                      <div className="hint-answer">{getRevealedText(hint)}</div>
                    ) : (
                      <div className="hint-sub">{getHintDescription(hint)}</div>
                    )}
                  </div>

                  {/* Right side */}
                  <div className="hint-right">
                    {owned ? (
                      <div className="hint-check-dot" dangerouslySetInnerHTML={{ __html: ICONS.check }} />
                    ) : (
                      <div className={`hint-cost-pill ${getCostClass(hint.tier)}`}>
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
