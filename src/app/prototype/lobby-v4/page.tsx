"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Compete Lobby v4 (from docs/ui/html/lobby Design.html)
// Route: /prototype/lobby-v4   (direct access, UI-only)
//
// Implements the bundled "lobby Design.html" dark "Create Game" screen
// (desktop 1680 + mobile 390 frames), reworked per review:
//   - Real prod TopBar reinstated (logo + RANK/accuracy pill + bell + avatar
//     + menu -> NavModal). gh-* tokens are pinned to dark values on .lv4-page
//     so the prod component stays consistent with this dark-only page.
//   - Below the topbar: prod lobby header — prominent back arrow, CHALLENGE
//     badge, and the pulsing status chip "lobby BERLIN".
//   - ANYTIME/LIVE buttons use the prod PNG icons (/icons/anytime_256.png,
//     /icons/live_256.png) as in /prototype/lobby-v2.
//   - Game Settings uses lobby-v2 logic: a disclosure (expanded by default on
//     desktop, collapsed on mobile via matchMedia) whose head is a 4-box
//     summary (Rounds / Results-or-Game / Eras / Regions) with a chevron
//     sitting right of the Regions box; expanding reveals the controls (round
//     timer switch+slider, results timer on LIVE or game-days slider on
//     ANYTIME, era/region tiles).
//   - The "Start my game" CTA is a fixed bottom bar — always visible without
//     scrolling.
//   - Invite controls: Humans and AI are independent toggles (both can be
//     on at once), and the favorites filter is "All [switch] Friends".
//   - Deselect-all pills are grey; unselected preset tiles grey out their
//     image; accent is the home-page compete blue (#22d3ee, bright stop of
//     the compete card gradient; the CTA carries the gradient itself).
//
// All data is MOCK and held in local state. No WebSocket, no Supabase from
// this page itself (the prod TopBar's own identity/notification fetches
// fail gracefully when unauthenticated).
// ============================================================================

import { useLayoutEffect, useState } from "react";
import TopBar from "@/components/layout/TopBar";
import { NavModal } from "@/components/NavModal";
import { ERA_STOCK_IMAGES, REGION_STOCK_IMAGES } from "@/core/useEraRegionImages";
import { TIMER_MIN_SEC, TIMER_MAX_SEC } from "@/core/types";

// ── Mock data (verbatim from the design bundle) ──
const ROOM_CODE = "BERLIN";

const ERAS: { label: string; sub: string; img: string }[] = [
  { label: "Ancient", sub: "-3000 – 476", img: ERA_STOCK_IMAGES.ancient },
  { label: "Medieval", sub: "476 – 1492", img: ERA_STOCK_IMAGES.medieval },
  { label: "Early Modern", sub: "1492 – 1789", img: ERA_STOCK_IMAGES.earlymodern },
  { label: "Modern", sub: "1789 – 1945", img: ERA_STOCK_IMAGES.modern },
  { label: "Contemporary", sub: "1945 – 2025", img: ERA_STOCK_IMAGES.contemporary },
];

const REGIONS: { label: string; img: string }[] = [
  { label: "Europe", img: REGION_STOCK_IMAGES.europe },
  { label: "Asia", img: REGION_STOCK_IMAGES.asia },
  { label: "North America", img: REGION_STOCK_IMAGES.north_america },
  { label: "South America", img: REGION_STOCK_IMAGES.south_america },
  { label: "Africa", img: REGION_STOCK_IMAGES.africa },
  { label: "Oceania & Antarctica", img: REGION_STOCK_IMAGES.oceania_antarctica },
];

const INVITES: { name: string; initials: string; ring: string }[] = [
  { name: "Thomas Edison#2212", initials: "TE", ring: "#06b6d4" },
  { name: "Go Sally Go", initials: "GS", ring: "#8b5cf6" },
  { name: "Jobby", initials: "JO", ring: "#f97316" },
  { name: "Florence Nightingale#9…", initials: "FN", ring: "#ec4899" },
  { name: "Sup Charley?!", initials: "SC", ring: "#22c55e" },
];

const PLAYERS: {
  name: string;
  initials: string;
  isYou: boolean;
  isHost: boolean;
  online: boolean;
  statusText: "JOINED" | "INVITED";
  removable: boolean;
  ring: string;
}[] = [
  { name: "Mimi", initials: "MI", isYou: true, isHost: true, online: true, statusText: "JOINED", removable: false, ring: "#22c55e" },
  { name: "Laurent El Lolo", initials: "LL", isYou: false, isHost: false, online: false, statusText: "INVITED", removable: true, ring: "#8b5cf6" },
  { name: "Lolo Turing", initials: "LT", isYou: false, isHost: false, online: false, statusText: "INVITED", removable: true, ring: "#f97316" },
];

const BG_TILES = Array.from({ length: 70 }, (_, i) => i);
const STAR_PATH = "M12 2l2.9 6.9 7.1.6-5.4 4.6 1.7 7-6.3-3.9-6.3 3.9 1.7-7L1 9.5l7.1-.6z";

const ROUND_TIMER_DEFAULT_SEC = 120;
const RESULTS_TIMER_DEFAULT_SEC = 30;
const DEADLINE_MIN = 1;
const DEADLINE_MAX = 14;

function formatTimerDisplay(sec: number): string {
  if (sec === 0) return "OFF";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

// ── Scoped styles (translated from the design's <style> block + lobby-v2
// summary-disclosure pattern; desktop rules are the base, mobile deltas live
// in the 768px media query). Accent = home compete card blue. ──
const LV4_CSS = `
  .lv4-page { position: relative; min-height: 100dvh; background: #0b0c12; color: #fff; overflow-x: hidden;
    /* gh-* pins so the prod TopBar/NavModal render dark on this dark-only page */
    --gh-bg-base: #0b0c12;
    --gh-bg-elevated: rgba(46, 49, 68, 0.9);
    --gh-bg-input: rgba(0, 0, 0, 0.18);
    --gh-border-default: rgba(255, 255, 255, 0.12);
    --gh-border-subtle: rgba(255, 255, 255, 0.08);
    --gh-text-primary: #ffffff;
    --gh-text-secondary: rgba(255, 255, 255, 0.60);
    --gh-text-muted: rgba(255, 255, 255, 0.50);
    --gh-text-tertiary: rgba(255, 255, 255, 0.45);
    --gh-gold: #f0c060;
    --gh-teal: #22d3ee;
    --gh-orange: #fb923c;
    --gh-orange-rgb: 251, 146, 60;
    --gh-success: #22c55e;
    --gh-danger: #ef4444;
    --gh-glass-bg: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03));
    --gh-glass-bg-hover: linear-gradient(180deg, rgba(255,255,255,0.11), rgba(255,255,255,0.06));
    --lv4-accent: #22d3ee;
    --lv4-accent-rgb: 34, 211, 238;
    --lv4-on-accent: #17130d;
  }
  .lv4-page *, .lv4-page *::before, .lv4-page *::after { box-sizing: border-box; }
  .lv4-page button { font: inherit; }
  .lv4-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

  .lv4-bg-tiles { position: fixed; inset: 0; display: grid; grid-template-columns: repeat(14, 1fr); grid-auto-rows: 1fr; gap: 3px; opacity: 0.55; pointer-events: none; z-index: 0; }
  .lv4-bg-tile { background: #262832; }
  .lv4-bg-tile:nth-child(3n) { background: #1c1e26; }
  .lv4-bg-tile:nth-child(5n) { background: #20222b; }
  .lv4-bg-tile:nth-child(7n) { background: #2b2e39; }
  .lv4-bg-scrim { position: fixed; inset: 0; background: radial-gradient(ellipse at center, rgba(11,12,18,0.97) 0%, rgba(11,12,18,0.92) 42%, rgba(11,12,18,0.62) 100%); pointer-events: none; z-index: 0; }

  .lv4-inner { position: relative; z-index: 1; padding: 64px 56px 96px; display: flex; flex-direction: column; gap: 22px; max-width: 1680px; margin: 0 auto; width: 100%; min-height: 100dvh; }

  /* ── Prod lobby header (under the fixed prod TopBar): prominent back arrow,
     CHALLENGE badge, pulsing "lobby CODE" status chip — grid 1fr auto 1fr ── */
  .lv4-header { position: relative; padding: 0 4px; }
  .lv4-header-top { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin-bottom: 10px; }
  .lv4-header-meta { display: flex; justify-content: flex-end; }
  .lv4-back-btn { width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.28); background: rgba(255,255,255,0.08); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; flex-shrink: 0; transition: background .15s ease, transform .15s ease; }
  .lv4-back-btn:hover { background: rgba(255,255,255,0.16); transform: scale(1.05); }
  .lv4-mode-badge { font-size: 12px; font-weight: 800; letter-spacing: 1.5px; color: var(--lv4-accent); background: rgba(var(--lv4-accent-rgb), 0.12); border: 1px solid rgba(var(--lv4-accent-rgb), 0.35); padding: 4px 10px; border-radius: 999px; }
  .lv4-status-chip { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.6); }
  .lv4-status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--lv4-accent); box-shadow: 0 0 8px rgba(var(--lv4-accent-rgb), 0.7); animation: lv4PulseDot 1.8s ease-in-out infinite; }
  @keyframes lv4PulseDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  .lv4-status-code { font-family: monospace; font-weight: 700; color: #fff; letter-spacing: 1px; }
  .lv4-page-title { text-align: center; font-size: 30px; font-weight: 800; color: #fff; margin: 4px 0 0; }

  .lv4-cards { display: flex; gap: 12px; justify-content: center; }
  .lv4-card { background: #2e3144; border: 1px solid rgba(255,255,255,0.13); border-radius: 20px; padding: 26px; display: flex; flex-direction: column; gap: 20px; box-shadow: 0 20px 50px rgba(0,0,0,0.35); color: #fff; min-width: 0; }
  .lv4-card-settings { width: 740px; flex-shrink: 1; }
  .lv4-card-invite { width: 720px; flex-shrink: 1; }
  .lv4-card-header { display: flex; align-items: center; justify-content: space-between; }
  .lv4-card-title-group { display: flex; align-items: center; gap: 10px; }
  .lv4-badge-num { width: 26px; height: 26px; border-radius: 50%; background: var(--lv4-accent); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; color: var(--lv4-on-accent); flex-shrink: 0; }
  .lv4-card-title { font-size: 17px; font-weight: 700; }
  .lv4-header-actions { display: flex; align-items: center; gap: 10px; }
  .lv4-icon-btn { width: 26px; height: 26px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.18); background: transparent; color: rgba(255,255,255,0.55); font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; }
  .lv4-share-btn { padding: 7px 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.04); color: #fff; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .lv4-pill-btn { padding: 7px 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.6); font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; }

  .lv4-seg-track { display: flex; gap: 6px; padding: 6px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; }
  .lv4-seg-btn { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 14px 10px; border: none; border-radius: 12px; cursor: pointer; background: transparent; color: rgba(255,255,255,0.55); transition: background-color .18s ease, color .18s ease; }
  .lv4-seg-btn-on { background: var(--lv4-accent); color: var(--lv4-on-accent); }
  .lv4-seg-icon { width: 30px; height: 30px; object-fit: contain; display: block; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.35)); transition: filter .18s ease; }
  .lv4-seg-btn:not(.lv4-seg-btn-on) .lv4-seg-icon { filter: drop-shadow(0 2px 5px rgba(0,0,0,0.35)) grayscale(1) opacity(0.55); }
  .lv4-seg-btn-label { font-size: 13px; font-weight: 700; letter-spacing: 0.04em; }
  .lv4-seg-cap-row { display: flex; gap: 6px; margin-top: 10px; }
  .lv4-seg-cap { flex: 1; text-align: center; font-size: 12px; line-height: 1.3; color: rgba(255,255,255,0.32); }
  .lv4-seg-cap-on { color: rgba(255,255,255,0.82); }
  .lv4-seg-track-sm { display: flex; gap: 4px; padding: 4px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; width: fit-content; }
  .lv4-seg-btn-sm { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border: none; border-radius: 9px; cursor: pointer; font-size: 12px; font-weight: 700; background: transparent; color: rgba(255,255,255,0.55); transition: background-color .18s ease, color .18s ease; }
  .lv4-seg-btn-sm-on { background: var(--lv4-accent); color: var(--lv4-on-accent); }

  /* ── lobby-v2-style collapsible settings: summary head (4 boxes + chevron)
     opens the window holding the actual controls ── */
  .lv4-disclosure { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; }
  .lv4-summary { display: grid; grid-template-columns: repeat(4, 1fr) auto; gap: 12px; padding: 16px 20px; cursor: pointer; align-items: center; }
  .lv4-disclosure-open .lv4-summary { border-bottom: 1px solid rgba(255,255,255,0.08); }
  .lv4-summary-pair { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.10); border-radius: 12px; padding: 10px 12px; min-width: 0; }
  .lv4-summary-label { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.55); text-transform: uppercase; letter-spacing: 0.05em; }
  .lv4-summary-value { font-size: 15px; font-weight: 700; color: var(--lv4-accent); }
  .lv4-summary-chevron { display: flex; align-items: center; justify-content: center; padding: 0 4px; color: rgba(255,255,255,0.6); transition: transform .2s ease; }
  .lv4-summary-chevron-open { transform: rotate(180deg); }
  .lv4-presets-content { display: flex; flex-direction: column; padding: 4px 20px 14px; }

  .lv4-settings-row { display: flex; flex-direction: column; padding: 14px 0; }
  .lv4-row-line { display: flex; align-items: center; justify-content: space-between; }
  .lv4-divider-top { border-top: 1px solid rgba(255,255,255,0.08); }
  .lv4-row-left { display: flex; align-items: center; gap: 10px; }
  .lv4-row-right { display: flex; align-items: center; gap: 10px; }
  .lv4-row-label { font-size: 15px; font-weight: 600; color: #fff; }
  .lv4-row-value { font-size: 12px; font-weight: 700; letter-spacing: 0.05em; color: rgba(255,255,255,0.55); }
  .lv4-row-value-on { color: var(--lv4-accent); }
  .lv4-days-label { font-size: 15px; font-weight: 700; color: var(--lv4-accent); }
  .lv4-switch { width: 42px; height: 24px; border-radius: 999px; border: none; position: relative; cursor: pointer; padding: 0; transition: background-color .18s ease; flex-shrink: 0; background: rgba(255,255,255,0.14); }
  .lv4-switch-on { background: var(--lv4-accent); }
  .lv4-switch-thumb { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.35); transition: left .18s ease; display: block; }
  .lv4-switch-on .lv4-switch-thumb { left: 21px; }
  .lv4-switch-sm { width: 32px; height: 18px; }
  .lv4-switch-sm .lv4-switch-thumb { width: 12px; height: 12px; top: 3px; }
  .lv4-switch-sm.lv4-switch-on .lv4-switch-thumb { left: 17px; }
  .lv4-range { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 999px; background: rgba(255,255,255,0.14); margin-top: 14px; display: block; }
  .lv4-range::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 3px solid var(--lv4-accent); cursor: pointer; }
  .lv4-range::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; border: 3px solid var(--lv4-accent); background: #fff; cursor: pointer; }

  .lv4-preset-group { display: flex; flex-direction: column; gap: 10px; padding: 14px 0 2px; }
  .lv4-preset-group-head { display: flex; align-items: center; gap: 10px; }
  .lv4-preset-group-title { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.65); text-transform: uppercase; letter-spacing: 0.05em; }
  .lv4-preset-count { font-size: 13px; font-weight: 700; color: var(--lv4-accent); }
  .lv4-tile-grid { display: grid; gap: 10px; }
  .lv4-tile-grid-eras { grid-template-columns: repeat(5, 1fr); }
  .lv4-tile-grid-regions { grid-template-columns: repeat(6, 1fr); }
  .lv4-tile { position: relative; border-radius: 12px; overflow: hidden; cursor: pointer; border: 2px solid transparent; aspect-ratio: 4/3; display: flex; align-items: flex-end; padding: 0; background: #2d2a24; font: inherit; text-align: left; color: inherit; }
  .lv4-tile:nth-child(4n+1) { background: #3a3327; }
  .lv4-tile:nth-child(4n+2) { background: #2d3630; }
  .lv4-tile:nth-child(4n+3) { background: #33303e; }
  .lv4-tile:nth-child(4n) { background: #2a2f38; }
  .lv4-tile-on { border-color: #06b6d4; }
  .lv4-tile-img { position: absolute; inset: 0; background-size: cover; background-position: center; transition: filter .18s ease; }
  .lv4-tile:not(.lv4-tile-on) .lv4-tile-img { filter: grayscale(1) brightness(0.55); }
  .lv4-tile-scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.78) 100%); }
  .lv4-tile-label { position: relative; padding: 8px 10px; font-size: 12px; font-weight: 700; color: #fff; }
  .lv4-tile-sub { display: block; font-size: 10px; font-weight: 500; color: rgba(255,255,255,0.65); margin-top: 2px; }

  .lv4-invite-controls { display: flex; align-items: center; justify-content: space-between; }
  .lv4-friends-switch { display: flex; align-items: center; gap: 10px; }
  .lv4-friends-label { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.45); transition: color .18s ease; }
  .lv4-friends-label-on { color: #fff; }
  .lv4-search-wrap { position: relative; }
  .lv4-search-input { width: 100%; padding: 11px 14px 11px 38px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.13); background: rgba(255,255,255,0.04); color: #fff; font-size: 14px; }
  .lv4-search-input::placeholder { color: rgba(255,255,255,0.4); }
  .lv4-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,0.4); pointer-events: none; display: flex; }

  .lv4-invite-scroll { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }
  .lv4-invite-card { flex: 0 0 auto; width: 104px; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
  .lv4-invite-name { font-size: 12px; font-weight: 600; color: #fff; line-height: 1.25; }
  .lv4-btn-outline-cyan { padding: 6px 16px; border-radius: 999px; border: 1px solid rgba(6,182,212,0.5); background: rgba(6,182,212,0.1); color: #06b6d4; font-size: 12px; font-weight: 700; cursor: pointer; }

  .lv4-avatar { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; border: 2px solid; position: relative; flex-shrink: 0; background: #1f212b; }
  .lv4-avatar-lg { width: 56px; height: 56px; font-size: 15px; }
  .lv4-avatar-sm { width: 34px; height: 34px; font-size: 12px; }
  .lv4-star-badge { position: absolute; top: -3px; right: -3px; width: 16px; height: 16px; border-radius: 50%; background: #1b1d27; display: flex; align-items: center; justify-content: center; color: #eab308; border: 1px solid rgba(255,255,255,0.15); }
  .lv4-online-dot { position: absolute; bottom: -1px; right: -1px; width: 9px; height: 9px; border-radius: 50%; background: #22c55e; border: 2px solid #2e3144; }

  .lv4-players-section { display: flex; flex-direction: column; gap: 12px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 16px; }
  .lv4-players-head { display: flex; align-items: center; gap: 8px; }
  .lv4-players-bar { width: 3px; height: 16px; background: var(--lv4-accent); border-radius: 2px; }
  .lv4-players-title { font-size: 14px; font-weight: 700; }
  .lv4-players-sub { margin-left: auto; font-size: 12px; color: rgba(255,255,255,0.45); }
  .lv4-players-list { display: flex; flex-direction: column; }
  .lv4-player-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.08); }
  .lv4-player-row:first-child { border-top: none; padding-top: 4px; }
  .lv4-player-name { font-size: 14px; font-weight: 600; }
  .lv4-tag { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px; }
  .lv4-tag-you { background: rgba(var(--lv4-accent-rgb),0.15); color: var(--lv4-accent); }
  .lv4-host-line { display: flex; align-items: center; gap: 4px; font-size: 11px; color: rgba(255,255,255,0.45); margin-top: 2px; }
  .lv4-status-pill { margin-left: auto; font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 999px; white-space: nowrap; }
  .lv4-status-joined { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); }
  .lv4-status-invited { background: rgba(234,179,8,0.15); color: #eab308; }
  .lv4-remove-btn { width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(239,68,68,0.4); background: rgba(239,68,68,0.12); color: #ef4444; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; }

  .lv4-cta-bar { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 50; display: flex; align-items: center; justify-content: center; gap: 10px; background: linear-gradient(135deg, #0369a1 0%, #0891b2 40%, #22d3ee 100%); color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.35); font-size: 16px; font-weight: 800; border-radius: 16px; padding: 17px; cursor: pointer; border: none; width: calc(100% - 112px); max-width: 1484px; box-shadow: 0 8px 28px rgba(0,0,0,0.5); }

  /* Cards can't keep 740+720 below ~1560px of usable width; stack them
     before they get cramped, full design sizes are preserved at >=1101px */
  @media (max-width: 1100px) {
    .lv4-inner { padding: 64px 24px 96px; }
    .lv4-cards { flex-direction: column; align-items: center; }
    .lv4-card-settings, .lv4-card-invite { width: 100%; max-width: 740px; }
  }

  /* Mobile frame (design: 390px) */
  @media (max-width: 768px) {
    .lv4-bg-tiles { grid-template-columns: repeat(8, 1fr); gap: 2px; opacity: 0.5; }
    .lv4-bg-scrim { background: radial-gradient(ellipse at 50% 30%, rgba(11,12,18,0.97) 0%, rgba(11,12,18,0.94) 45%, rgba(11,12,18,0.72) 100%); }
    .lv4-inner { padding: 60px 16px 92px; gap: 18px; }
    .lv4-back-btn { width: 40px; height: 40px; }
    .lv4-mode-badge { font-size: 11px; padding: 3px 9px; }
    .lv4-status-chip { font-size: 11px; }
    .lv4-page-title { font-size: 22px; margin-top: 2px; }
    .lv4-card { border-radius: 18px; padding: 20px; gap: 18px; box-shadow: 0 14px 34px rgba(0,0,0,0.35); }
    .lv4-card-title-group { gap: 9px; }
    .lv4-badge-num { width: 24px; height: 24px; font-size: 12px; }
    .lv4-card-title { font-size: 16px; }
    .lv4-header-actions { gap: 8px; }
    .lv4-icon-btn { width: 24px; height: 24px; font-size: 11px; }
    .lv4-share-btn { padding: 6px 12px; font-size: 11px; }
    .lv4-pill-btn { padding: 6px 12px; font-size: 10px; }
    .lv4-seg-btn { gap: 5px; padding: 12px 8px; border-radius: 11px; }
    .lv4-seg-icon { width: 26px; height: 26px; }
    .lv4-seg-btn-label { font-size: 12px; letter-spacing: 0.03em; }
    .lv4-seg-cap-row { margin-top: 9px; }
    .lv4-seg-cap { font-size: 11px; }
    .lv4-seg-btn-sm { gap: 5px; padding: 7px 13px; border-radius: 9px; font-size: 11px; }
    .lv4-invite-controls { flex-wrap: wrap; gap: 10px; }
    .lv4-friends-label { font-size: 12px; }
    .lv4-summary { gap: 8px; padding: 12px 12px; }
    .lv4-summary-pair { padding: 8px 4px; }
    .lv4-summary-label { font-size: 10px; }
    .lv4-summary-value { font-size: 13px; }
    .lv4-summary-chevron { padding: 0 2px; }
    .lv4-presets-content { padding: 2px 12px 12px; }
    .lv4-settings-row { padding: 12px 0; }
    .lv4-row-left { gap: 9px; }
    .lv4-row-right { gap: 9px; }
    .lv4-row-label { font-size: 14px; }
    .lv4-row-value { font-size: 11px; }
    .lv4-days-label { font-size: 14px; }
    .lv4-switch { width: 40px; height: 23px; }
    .lv4-switch-thumb { width: 17px; height: 17px; }
    .lv4-switch-on .lv4-switch-thumb { left: 20px; }
    .lv4-switch-sm { width: 30px; height: 17px; }
    .lv4-switch-sm .lv4-switch-thumb { width: 11px; height: 11px; }
    .lv4-switch-sm.lv4-switch-on .lv4-switch-thumb { left: 16px; }
    .lv4-range { margin-top: 13px; }
    .lv4-range::-webkit-slider-thumb { width: 17px; height: 17px; }
    .lv4-range::-moz-range-thumb { width: 17px; height: 17px; }
    .lv4-preset-group { gap: 9px; }
    .lv4-preset-group-head { gap: 8px; flex-wrap: wrap; }
    .lv4-preset-group-title { font-size: 11px; }
    .lv4-preset-count { font-size: 12px; }
    .lv4-tile-grid { gap: 8px; }
    .lv4-tile-grid-eras, .lv4-tile-grid-regions { grid-template-columns: repeat(3, 1fr); }
    .lv4-tile { border-radius: 11px; }
    .lv4-tile-scrim { background: linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.8) 100%); }
    .lv4-tile-label { padding: 6px 8px; font-size: 10.5px; line-height: 1.2; }
    .lv4-tile-sub { font-size: 9px; margin-top: 1px; }
    .lv4-search-input { padding: 10px 14px 10px 36px; font-size: 13px; }
    .lv4-search-icon { left: 11px; }
    .lv4-invite-scroll { gap: 10px; margin: 0 -20px; padding: 0 20px 4px; }
    .lv4-invite-card { width: 92px; gap: 7px; }
    .lv4-invite-name { font-size: 11px; }
    .lv4-btn-outline-cyan { padding: 5px 13px; font-size: 11px; }
    .lv4-avatar-lg { width: 52px; height: 52px; font-size: 14px; }
    .lv4-avatar-sm { width: 32px; height: 32px; font-size: 11px; }
    .lv4-star-badge { width: 15px; height: 15px; }
    .lv4-online-dot { width: 8px; height: 8px; }
    .lv4-players-section { gap: 10px; padding-top: 14px; }
    .lv4-players-bar { height: 15px; }
    .lv4-players-title { font-size: 13px; }
    .lv4-players-sub { font-size: 11px; }
    .lv4-player-row { gap: 10px; padding: 9px 0; }
    .lv4-player-row:first-child { padding-top: 3px; }
    .lv4-player-name { font-size: 13px; }
    .lv4-tag { font-size: 9px; padding: 2px 6px; }
    .lv4-host-line { font-size: 10px; }
    .lv4-status-pill { font-size: 10px; padding: 4px 9px; }
    .lv4-remove-btn { width: 22px; height: 22px; }
    .lv4-cta-bar { font-size: 15px; border-radius: 15px; padding: 16px; gap: 9px; width: calc(100% - 32px); bottom: 12px; }
  }
`;

export default function LobbyV4PrototypePage() {
  // ── Mock state (v2 lobby semantics on the v4 design) ──
  const [mode, setMode] = useState<"anytime" | "live">("anytime");
  const [roundTimer, setRoundTimer] = useState(0); // sec, 0 = OFF
  const [resultsTimer, setResultsTimer] = useState(RESULTS_TIMER_DEFAULT_SEC); // live only
  const [days, setDays] = useState(3); // anytime only, 1–14
  const [presetsOpen, setPresetsOpen] = useState(true);

  // Expanded by default on desktop, collapsed on mobile — resolved before
  // first paint (same matchMedia gate as lobby-v2).
  useLayoutEffect(() => {
    const m = window.matchMedia("(min-width: 769px)");
    setPresetsOpen(m.matches);
  }, []);
  const [eras, setEras] = useState<boolean[]>([true, true, true, true, true]);
  const [regions, setRegions] = useState<boolean[]>([true, true, true, true, true, true]);
  const [filterHumans, setFilterHumans] = useState(true);
  const [filterAi, setFilterAi] = useState(false);
  const [filterFriends, setFilterFriends] = useState(false);
  const [showNavModal, setShowNavModal] = useState(false);

  const isAnytime = mode === "anytime";
  const isLive = mode === "live";
  const eraCount = eras.filter(Boolean).length;
  const regionCount = regions.filter(Boolean).length;
  const rosterTotal = isAnytime ? 30 : 8;

  // Mirror v2: entering ANYTIME resets the per-round timer to OFF.
  const pickMode = (next: "anytime" | "live") => {
    setMode(next);
    if (next === "anytime" && roundTimer > 0) setRoundTimer(0);
  };

  const toggleEra = (i: number) =>
    setEras((prev) => prev.map((v, j) => (j === i ? !v : v)));
  const toggleRegion = (i: number) =>
    setRegions((prev) => prev.map((v, j) => (j === i ? !v : v)));

  return (
    <main className="lv4-page" data-testid="lv4-shell">
      {/* Prod topbar (fixed) — same component as prod compete/home */}
      <TopBar
        accuracy="22"
        xp="32500"
        avatarUrl={null}
        initials="LO"
        onAvatarClick={() => setShowNavModal(true)}
      />
      <NavModal
        isOpen={showNavModal}
        onClose={() => setShowNavModal(false)}
        avatarUrl={null}
        initials="LO"
        displayName="Lolo"
      />

      <div className="lv4-bg-tiles" aria-hidden="true">
        {BG_TILES.map((i) => (
          <div key={i} className="lv4-bg-tile" />
        ))}
      </div>
      <div className="lv4-bg-scrim" aria-hidden="true" />

      <div className="lv4-inner">
        {/* Prod lobby header: prominent back | CHALLENGE | lobby CODE */}
        <header className="lv4-header">
          <div className="lv4-header-top">
            <button
              type="button"
              className="lv4-back-btn"
              aria-label="Back"
              data-testid="lv4-back-btn"
              onClick={() => typeof window !== "undefined" && window.history.back()}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
            <span className="lv4-mode-badge">CHALLENGE</span>
            <div className="lv4-header-meta">
              <span className="lv4-status-chip">
                <span className="lv4-status-dot" />
                lobby{" "}
                <span className="lv4-status-code">{ROOM_CODE}</span>
              </span>
            </div>
          </div>
          <h1 className="lv4-page-title">Create Game</h1>
        </header>

        <div className="lv4-cards">
          {/* ── Game Settings card ── */}
          <div className="lv4-card lv4-card-settings">
            <div className="lv4-card-header">
              <div className="lv4-card-title-group">
                <div className="lv4-badge-num">1</div>
                <span className="lv4-card-title">Game Settings</span>
              </div>
              <button type="button" className="lv4-icon-btn" aria-label="Game settings help">?</button>
            </div>

            <div>
              <div role="group" aria-label="Pacing mode" className="lv4-seg-track">
                <button
                  type="button"
                  className={`lv4-seg-btn ${isAnytime ? "lv4-seg-btn-on" : ""}`}
                  aria-pressed={isAnytime}
                  onClick={() => pickMode("anytime")}
                  data-testid="lv4-mode-anytime"
                >
                  <img src="/icons/anytime_256.png" alt="" width={30} height={30} className="lv4-seg-icon" draggable={false} />
                  <span className="lv4-seg-btn-label">ANYTIME</span>
                </button>
                <button
                  type="button"
                  className={`lv4-seg-btn ${isLive ? "lv4-seg-btn-on" : ""}`}
                  aria-pressed={isLive}
                  onClick={() => pickMode("live")}
                  data-testid="lv4-mode-live"
                >
                  <img src="/icons/live_256.png" alt="" width={30} height={30} className="lv4-seg-icon" draggable={false} />
                  <span className="lv4-seg-btn-label">LIVE</span>
                </button>
              </div>
              <div className="lv4-seg-cap-row">
                <div className={`lv4-seg-cap ${isAnytime ? "lv4-seg-cap-on" : ""}`}>Play at your own pace</div>
                <div className={`lv4-seg-cap ${isLive ? "lv4-seg-cap-on" : ""}`}>Play all at the same time</div>
              </div>
            </div>

            {/* lobby-v2-style disclosure: summary head toggles the window */}
            <div className={`lv4-disclosure ${presetsOpen ? "lv4-disclosure-open" : ""}`}>
              <div
                className="lv4-summary"
                role="button"
                tabIndex={0}
                aria-expanded={presetsOpen}
                onClick={() => setPresetsOpen((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPresetsOpen((v) => !v);
                  }
                }}
                data-testid="lv4-settings-summary"
              >
                <div className="lv4-summary-pair">
                  <span className="lv4-summary-label">Rounds</span>
                  <span className="lv4-summary-value">{formatTimerDisplay(roundTimer)}</span>
                </div>
                {isLive ? (
                  <div className="lv4-summary-pair">
                    <span className="lv4-summary-label">Results</span>
                    <span className="lv4-summary-value">{formatTimerDisplay(resultsTimer)}</span>
                  </div>
                ) : (
                  <div className="lv4-summary-pair">
                    <span className="lv4-summary-label">Game</span>
                    <span className="lv4-summary-value">{days === 1 ? "1 day" : `${days} days`}</span>
                  </div>
                )}
                <div className="lv4-summary-pair">
                  <span className="lv4-summary-label">Eras</span>
                  <span className="lv4-summary-value">{eraCount}/5</span>
                </div>
                <div className="lv4-summary-pair">
                  <span className="lv4-summary-label">Regions</span>
                  <span className="lv4-summary-value">{regionCount}/6</span>
                </div>
                <span className={`lv4-summary-chevron ${presetsOpen ? "lv4-summary-chevron-open" : ""}`} aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </span>
              </div>

              {presetsOpen && (
                <div className="lv4-presets-content">
                  {/* Round timer — both modes (v2 semantics: switch + slider) */}
                  <div className="lv4-settings-row">
                    <div className="lv4-row-line">
                      <div className="lv4-row-left">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9.5v4l2.4 1.4" /><path d="M9.5 3.2h5" /></svg>
                        <label htmlFor="lv4-round-toggle" className="lv4-row-label">Round</label>
                      </div>
                      <div className="lv4-row-right">
                        <span className={`lv4-row-value ${roundTimer > 0 ? "lv4-row-value-on" : ""}`}>{formatTimerDisplay(roundTimer)}</span>
                        <button
                          id="lv4-round-toggle"
                          type="button"
                          role="switch"
                          aria-checked={roundTimer > 0}
                          aria-label="Round timer"
                          className={`lv4-switch ${roundTimer > 0 ? "lv4-switch-on" : ""}`}
                          onClick={() => setRoundTimer((v) => (v > 0 ? 0 : ROUND_TIMER_DEFAULT_SEC))}
                          data-testid="lv4-round-toggle"
                        >
                          <span className="lv4-switch-thumb" />
                        </button>
                      </div>
                    </div>
                    {roundTimer > 0 && (
                      <input
                        type="range"
                        min={TIMER_MIN_SEC}
                        max={TIMER_MAX_SEC}
                        step={15}
                        value={roundTimer}
                        onChange={(e) => setRoundTimer(Number(e.target.value))}
                        aria-label="Round timer seconds"
                        className="lv4-range"
                        data-testid="lv4-round-slider"
                      />
                    )}
                  </div>

                  {/* Results timer — LIVE only (v2 realtime semantics) */}
                  {isLive && (
                    <div className="lv4-settings-row lv4-divider-top">
                      <div className="lv4-row-line">
                        <div className="lv4-row-left">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9.5v4l2.4 1.4" /><path d="M9.5 3.2h5" /></svg>
                          <label htmlFor="lv4-results-toggle" className="lv4-row-label">Results</label>
                        </div>
                        <div className="lv4-row-right">
                          <span className={`lv4-row-value ${resultsTimer > 0 ? "lv4-row-value-on" : ""}`}>{formatTimerDisplay(resultsTimer)}</span>
                          <button
                            id="lv4-results-toggle"
                            type="button"
                            role="switch"
                            aria-checked={resultsTimer > 0}
                            aria-label="Results timer"
                            className={`lv4-switch ${resultsTimer > 0 ? "lv4-switch-on" : ""}`}
                            onClick={() => setResultsTimer((v) => (v > 0 ? 0 : RESULTS_TIMER_DEFAULT_SEC))}
                            data-testid="lv4-results-toggle"
                          >
                            <span className="lv4-switch-thumb" />
                          </button>
                        </div>
                      </div>
                      {resultsTimer > 0 && (
                        <input
                          type="range"
                          min={TIMER_MIN_SEC}
                          max={TIMER_MAX_SEC}
                          step={15}
                          value={resultsTimer}
                          onChange={(e) => setResultsTimer(Number(e.target.value))}
                          aria-label="Results timer seconds"
                          className="lv4-range"
                          data-testid="lv4-results-slider"
                        />
                      )}
                    </div>
                  )}

                  {/* Game length — ANYTIME only (v2 turnturn semantics, 1–14 days) */}
                  {isAnytime && (
                    <div className="lv4-settings-row lv4-divider-top">
                      <div className="lv4-row-line">
                        <div className="lv4-row-left">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 9.5h17" /><path d="M8 3v4" /><path d="M16 3v4" /></svg>
                          <label htmlFor="lv4-game-days" className="lv4-row-label">Game</label>
                        </div>
                        <span className="lv4-days-label">{days === 1 ? "1 day" : `${days} days`}</span>
                      </div>
                      <input
                        id="lv4-game-days"
                        type="range"
                        min={DEADLINE_MIN}
                        max={DEADLINE_MAX}
                        step={1}
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value))}
                        aria-label="Game length in days"
                        className="lv4-range"
                        data-testid="lv4-days"
                      />
                    </div>
                  )}

                  {/* Era presets */}
                  <div className="lv4-preset-group lv4-divider-top">
                    <div className="lv4-preset-group-head">
                      <span className="lv4-preset-group-title">Era Presets</span>
                      <span className="lv4-preset-count">{eraCount} / 5</span>
                      <button type="button" className="lv4-pill-btn" style={{ marginLeft: "auto" }} onClick={() => setEras(eras.map(() => false))}>
                        Deselect all
                      </button>
                    </div>
                    <div className="lv4-tile-grid lv4-tile-grid-eras">
                      {ERAS.map((era, i) => (
                        <button
                          key={era.label}
                          type="button"
                          className={`lv4-tile ${eras[i] ? "lv4-tile-on" : ""}`}
                          aria-pressed={eras[i]}
                          onClick={() => toggleEra(i)}
                        >
                          <span className="lv4-tile-img" style={{ backgroundImage: `url(${era.img})` }} aria-hidden="true" />
                          <span className="lv4-tile-scrim" aria-hidden="true" />
                          <span className="lv4-tile-label">
                            {era.label}
                            <span className="lv4-tile-sub">{era.sub}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Region presets */}
                  <div className="lv4-preset-group lv4-divider-top">
                    <div className="lv4-preset-group-head">
                      <span className="lv4-preset-group-title">Region Presets</span>
                      <span className="lv4-preset-count">{regionCount} / 6</span>
                      <button type="button" className="lv4-pill-btn" style={{ marginLeft: "auto" }} onClick={() => setRegions(regions.map(() => false))}>
                        Deselect all
                      </button>
                    </div>
                    <div className="lv4-tile-grid lv4-tile-grid-regions">
                      {REGIONS.map((region, i) => (
                        <button
                          key={region.label}
                          type="button"
                          className={`lv4-tile ${regions[i] ? "lv4-tile-on" : ""}`}
                          aria-pressed={regions[i]}
                          onClick={() => toggleRegion(i)}
                        >
                          <span className="lv4-tile-img" style={{ backgroundImage: `url(${region.img})` }} aria-hidden="true" />
                          <span className="lv4-tile-scrim" aria-hidden="true" />
                          <span className="lv4-tile-label">{region.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Invite Players card ── */}
          <div className="lv4-card lv4-card-invite">
            <div className="lv4-card-header">
              <div className="lv4-card-title-group">
                <div className="lv4-badge-num">2</div>
                <span className="lv4-card-title">Invite Players</span>
              </div>
              <div className="lv4-header-actions">
                <button type="button" className="lv4-share-btn">Share link</button>
                <button type="button" className="lv4-icon-btn" aria-label="Invite players help">?</button>
              </div>
            </div>

            <div className="lv4-invite-controls">
              <div role="group" aria-label="Player type" className="lv4-seg-track-sm">
                <button
                  type="button"
                  className={`lv4-seg-btn-sm ${filterHumans ? "lv4-seg-btn-sm-on" : ""}`}
                  aria-pressed={filterHumans}
                  onClick={() => setFilterHumans((v) => !v)}
                  data-testid="lv4-filter-humans"
                >
                  Humans
                </button>
                <button
                  type="button"
                  className={`lv4-seg-btn-sm ${filterAi ? "lv4-seg-btn-sm-on" : ""}`}
                  aria-pressed={filterAi}
                  onClick={() => setFilterAi((v) => !v)}
                  data-testid="lv4-filter-ai"
                >
                  AI
                </button>
              </div>
              <div className="lv4-friends-switch">
                <label htmlFor="lv4-friends-toggle" className={`lv4-friends-label ${!filterFriends ? "lv4-friends-label-on" : ""}`}>All</label>
                <button
                  id="lv4-friends-toggle"
                  type="button"
                  role="switch"
                  aria-checked={filterFriends}
                  aria-label="Friends only"
                  className={`lv4-switch lv4-switch-sm ${filterFriends ? "lv4-switch-on" : ""}`}
                  onClick={() => setFilterFriends((v) => !v)}
                  data-testid="lv4-friends-toggle"
                >
                  <span className="lv4-switch-thumb" />
                </button>
                <label htmlFor="lv4-friends-toggle" className={`lv4-friends-label ${filterFriends ? "lv4-friends-label-on" : ""}`}>Friends</label>
              </div>
            </div>

            <div className="lv4-search-wrap">
              <span className="lv4-search-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
              </span>
              <label htmlFor="lv4-player-search" className="lv4-sr-only">Search players</label>
              <input id="lv4-player-search" type="text" className="lv4-search-input" placeholder="Search players…" />
            </div>

            <div className="lv4-invite-scroll">
              {INVITES.map((p) => (
                <div key={p.name} className="lv4-invite-card">
                  <div className="lv4-avatar lv4-avatar-lg" style={{ borderColor: p.ring }}>
                    {p.initials}
                    <span className="lv4-star-badge">
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={STAR_PATH} /></svg>
                    </span>
                  </div>
                  <div className="lv4-invite-name">{p.name}</div>
                  <button type="button" className="lv4-btn-outline-cyan">Invite</button>
                </div>
              ))}
            </div>

            <div className="lv4-players-section">
              <div className="lv4-players-head">
                <span className="lv4-players-bar" />
                <span className="lv4-players-title">Players ({PLAYERS.length}/{rosterTotal})</span>
                <span className="lv4-players-sub">0 ready</span>
              </div>
              <div className="lv4-players-list" data-testid="lv4-roster">
                {PLAYERS.map((p) => (
                  <div key={p.name} className="lv4-player-row">
                    <div className="lv4-avatar lv4-avatar-sm" style={{ borderColor: p.ring }}>
                      {p.initials}
                      {p.online && <span className="lv4-online-dot" />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="lv4-player-name">{p.name}</span>
                        {p.isYou && <span className="lv4-tag lv4-tag-you">You</span>}
                      </div>
                      {p.isHost && (
                        <div className="lv4-host-line">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 18h16l-1.6-9-4.1 3.2-2.3-5.4-2.3 5.4-4.1-3.2z" /></svg>
                          Host
                        </div>
                      )}
                    </div>
                    <span className={`lv4-status-pill ${p.statusText === "JOINED" ? "lv4-status-joined" : "lv4-status-invited"}`}>
                      {p.statusText}
                    </span>
                    {p.removable && (
                      <button type="button" className="lv4-remove-btn" aria-label={`Remove ${p.name}`}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6l-12 12" /></svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button type="button" className="lv4-cta-bar" data-testid="lv4-start-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          Start my game
        </button>
      </div>
      <style dangerouslySetInnerHTML={{ __html: LV4_CSS }} />
    </main>
  );
}
