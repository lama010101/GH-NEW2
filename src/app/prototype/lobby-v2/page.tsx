"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Compete Lobby V2 (re-thought UIX)
// Route: /prototype/lobby-v2   (direct access, self-contained, mock data)
//
// Original layout (not a prod mirror):
//   Room-code hero — big letter tiles + copy link/code chips
//   Slot roster    — 8 fixed slots: joined players + dashed open slots,
//                    ready progress bar in the card head
//   Invite rail    — search + horizontal pool cards + share-link tile
//   Match setup    — ANYTIME/LIVE segmented pills, chip-stepper timers,
//                    photo-backed era/region toggle chips, summary strip
//   Sticky dock    — full-width "I'm ready" toggle + ready counter
//
// All data is MOCK and held in local state. No WebSocket, no Supabase.
// Only this file is new; the prototype index gains one list entry.
// ============================================================================

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Crown,
  Hourglass,
  Link2,
  Search,
  Sparkles,
  Timer,
  Users,
  X,
  Zap,
} from "lucide-react";

// ── Mock data ────────────────────────────────────────────────────────────────
const VIEWER_ID = "p1";
const ROOM_CODE = "BERLIN";
const MAX_SLOTS = 8;

type MockPlayer = {
  id: string;
  name: string;
  ready: boolean;
  isHost: boolean;
};

type PoolEntry = {
  id: string;
  name: string;
  isAi: boolean;
};

const INITIAL_PLAYERS: MockPlayer[] = [
  { id: "p1", name: "Alex Rivera", ready: false, isHost: true },
  { id: "p2", name: "Mina Kovač", ready: true, isHost: false },
  { id: "p3", name: "Theo Lambert", ready: false, isHost: false },
  { id: "p4", name: "Sara Bianchi", ready: true, isHost: false },
];

const INVITE_POOL: PoolEntry[] = [
  { id: "u10", name: "Liang Wei", isAi: false },
  { id: "u11", name: "Nora Hansen", isAi: false },
  { id: "u12", name: "Omar Farouk", isAi: false },
  { id: "u13", name: "Priya Nair", isAi: false },
  { id: "u14", name: "Diego Santos", isAi: false },
  { id: "u15", name: "Yuki Tanaka", isAi: false },
  { id: "u16", name: "Elena Popescu", isAi: false },
  { id: "u17", name: "Marcus Webb", isAi: false },
  { id: "ai1", name: "Hermes AI", isAi: true },
  { id: "ai2", name: "Athena AI", isAi: true },
];

const ERAS = [
  { id: "ancient", label: "Ancient", span: "−3000–476", img: "/prototype/lobby-settings-images/ancient.jpg" },
  { id: "medieval", label: "Medieval", span: "476–1492", img: "/prototype/lobby-settings-images/medieval.jpg" },
  { id: "earlymodern", label: "Early Modern", span: "1492–1789", img: "/prototype/lobby-settings-images/earlymodern.jpg" },
  { id: "modern", label: "Modern", span: "1789–1945", img: "/prototype/lobby-settings-images/modern.jpg" },
  { id: "contemporary", label: "Contemporary", span: "1945–2025", img: "/prototype/lobby-settings-images/contemporary.jpg" },
] as const;
type EraId = (typeof ERAS)[number]["id"];

const REGIONS = [
  { id: "europe", label: "Europe", img: "/prototype/lobby-settings-images/europe.jpg" },
  { id: "asia", label: "Asia", img: "/prototype/lobby-settings-images/asia.jpg" },
  { id: "north_america", label: "N. America", img: "/prototype/lobby-settings-images/north_america.jpg" },
  { id: "south_america", label: "S. America", img: "/prototype/lobby-settings-images/south_america.jpg" },
  { id: "africa", label: "Africa", img: "/prototype/lobby-settings-images/africa.jpg" },
  { id: "oceania_antarctica", label: "Oceania", img: "/prototype/lobby-settings-images/oceania_antarctica.jpg" },
] as const;
type RegionId = (typeof REGIONS)[number]["id"];

const ROUND_TIMER_STEPS = [0, 30, 60, 120, 180, 300];
const RESULTS_TIMER_STEPS = [0, 15, 30, 60, 120];
const DEADLINE_STEPS = [1, 3, 7, 14];

function fmtTimer(sec: number): string {
  if (sec === 0) return "OFF";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? (s > 0 ? `${m}m ${s}s` : `${m}m`) : `${s}s`;
}

function gradientFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const h1 = hash % 360;
  const h2 = (h1 + 48) % 360;
  return `linear-gradient(135deg, hsl(${h1} 70% 55%), hsl(${h2} 70% 42%))`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

// ── Styles ───────────────────────────────────────────────────────────────────
const CSS = `
  .lv2 {
    min-height: 100vh;
    color: var(--gh-text-primary, #fff);
    font-family: inherit;
    padding-bottom: 132px;
  }
  .lv2::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -2;
    background: url("/desktop-home_background.webp") center / cover no-repeat;
  }
  .lv2::after {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    background: linear-gradient(180deg, rgba(8, 12, 20, 0.78) 0%, rgba(8, 12, 20, 0.94) 100%);
  }
  .lv2Proto {
    position: sticky;
    top: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 16px;
    background: rgba(8, 12, 20, 0.72);
    border-bottom: 1px solid var(--gh-border-subtle, rgba(255,255,255,0.08));
    backdrop-filter: blur(10px);
  }
  .lv2ProtoTitle { font-size: 12.5px; font-weight: 700; letter-spacing: 0.04em; }
  .lv2ProtoTitle b { color: var(--gh-teal, #22d3ee); }
  .lv2ProtoHint { font-size: 11.5px; font-weight: 600; color: var(--gh-text-muted, rgba(255,255,255,0.5)); }

  .lv2Wrap {
    max-width: 1080px;
    margin: 0 auto;
    padding: 22px clamp(14px, 3.5vw, 32px) 0;
  }

  /* ── Header / room hero ── */
  .lv2Top {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
  }
  .lv2Back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 12px;
    border: 1px solid var(--gh-glass-border, rgba(255,255,255,0.10));
    background: var(--gh-glass-bg, rgba(255,255,255,0.06));
    color: #fff;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease;
  }
  .lv2Back:hover { background: var(--gh-glass-bg-hover, rgba(255,255,255,0.12)); }
  .lv2Mode {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.14em;
    color: var(--gh-teal, #22d3ee);
    background: rgba(var(--gh-teal-rgb, 34,211,238), 0.10);
    border: 1px solid rgba(var(--gh-teal-rgb, 34,211,238), 0.35);
    padding: 5px 13px;
    border-radius: var(--gh-radius-pill, 999px);
  }
  .lv2Live {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    font-weight: 600;
    color: var(--gh-text-secondary, rgba(255,255,255,0.6));
  }
  .lv2LiveDot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--gh-teal, #22d3ee);
    box-shadow: 0 0 8px rgba(var(--gh-teal-rgb, 34,211,238), 0.8);
    animation: lv2Pulse 1.8s ease-in-out infinite;
  }
  @keyframes lv2Pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

  .lv2Hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
    padding: 20px clamp(16px, 3vw, 26px);
    border-radius: var(--gh-glass-radius, 18px);
    background: var(--gh-glass-bg, linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03)));
    border: 1px solid var(--gh-glass-border, rgba(255,255,255,0.10));
    box-shadow: var(--gh-glass-shadow, 0 8px 30px rgba(0,0,0,0.35));
    margin-bottom: 20px;
  }
  .lv2HeroLeft { min-width: 0; }
  .lv2HeroKicker {
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--gh-text-muted, rgba(255,255,255,0.5));
    margin-bottom: 10px;
  }
  .lv2Code {
    display: flex;
    gap: 7px;
    flex-wrap: wrap;
  }
  .lv2CodeChar {
    width: 44px;
    height: 54px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 0.02em;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(var(--gh-teal-rgb, 34,211,238), 0.30);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 14px rgba(0,0,0,0.35);
    color: var(--gh-gold, #f0c060);
    text-shadow: 0 2px 6px rgba(0,0,0,0.5);
  }
  .lv2HeroActions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }
  .lv2CopyBtn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    font-weight: 700;
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid var(--gh-border-default, rgba(255,255,255,0.12));
    border-radius: 11px;
    padding: 9px 15px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .lv2CopyBtn:hover {
    background: rgba(255, 255, 255, 0.14);
    border-color: var(--gh-glass-border-hover, rgba(255,255,255,0.20));
  }
  .lv2CopyBtn.lv2Copied {
    color: var(--gh-success, #22c55e);
    border-color: rgba(var(--gh-success-rgb, 34,197,94), 0.45);
  }
  @media (max-width: 560px) {
    .lv2CodeChar { width: 36px; height: 44px; font-size: 21px; }
    .lv2HeroActions { flex-direction: row; width: 100%; }
    .lv2CopyBtn { flex: 1; justify-content: center; }
  }

  /* ── Main grid ── */
  .lv2Grid {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    gap: 18px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .lv2Grid { grid-template-columns: 1fr; }
  }
  .lv2Col { display: flex; flex-direction: column; gap: 18px; min-width: 0; }

  .lv2Card {
    border-radius: var(--gh-glass-radius, 18px);
    background: var(--gh-glass-bg, linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03)));
    border: 1px solid var(--gh-glass-border, rgba(255,255,255,0.10));
    box-shadow: var(--gh-glass-shadow, 0 8px 30px rgba(0,0,0,0.35));
    padding: 18px;
    backdrop-filter: blur(10px);
  }
  .lv2CardHead {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
  }
  .lv2Bar {
    width: 4px;
    height: 18px;
    border-radius: 999px;
    background: linear-gradient(180deg, var(--gh-orange, #fb923c), #e6502b);
    flex-shrink: 0;
  }
  .lv2CardTitle {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.01em;
  }
  .lv2Dim { color: var(--gh-text-muted, rgba(255,255,255,0.5)); font-weight: 600; }
  .lv2HeadRight { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; }

  /* ── Ready progress ── */
  .lv2ReadyWrap { display: flex; align-items: center; gap: 10px; }
  .lv2ReadyBar {
    width: 110px;
    height: 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.10);
    overflow: hidden;
  }
  .lv2ReadyFill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--gh-success, #22c55e), #4ade80);
    transition: width 0.3s ease;
  }
  .lv2ReadyText {
    font-size: 12px;
    font-weight: 700;
    color: var(--gh-text-secondary, rgba(255,255,255,0.6));
    white-space: nowrap;
  }
  @media (max-width: 560px) {
    .lv2ReadyBar { width: 64px; }
  }

  /* ── Slot roster ── */
  .lv2Slots {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 9px;
  }
  @media (max-width: 560px) {
    .lv2Slots { grid-template-columns: 1fr; }
  }
  .lv2Slot {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 11px;
    border-radius: 13px;
    background: rgba(255, 255, 255, 0.045);
    border: 1px solid var(--gh-border-subtle, rgba(255,255,255,0.08));
    min-width: 0;
  }
  .lv2SlotReady {
    border-color: rgba(var(--gh-success-rgb, 34,197,94), 0.35);
    background: rgba(var(--gh-success-rgb, 34,197,94), 0.07);
  }
  .lv2SlotEmpty {
    border-style: dashed;
    border-color: rgba(255, 255, 255, 0.16);
    background: transparent;
  }
  .lv2Avatar {
    flex-shrink: 0;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13.5px;
    font-weight: 800;
    color: #fff;
    border: 2px solid rgba(255, 255, 255, 0.22);
    position: relative;
  }
  .lv2AvatarEmpty {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.14);
    color: var(--gh-text-muted, rgba(255,255,255,0.5));
  }
  .lv2AvatarCrown {
    position: absolute;
    top: -9px;
    right: -6px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--gh-gold, #f0c060);
    color: #3a2703;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  }
  .lv2SlotMeta { min-width: 0; flex: 1; }
  .lv2SlotName {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13.5px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lv2You {
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.08em;
    padding: 1.5px 7px;
    border-radius: 999px;
    color: #06181c;
    background: var(--gh-teal, #22d3ee);
    flex-shrink: 0;
  }
  .lv2SlotSub {
    font-size: 11px;
    font-weight: 600;
    color: var(--gh-text-muted, rgba(255,255,255,0.5));
    margin-top: 1px;
  }
  .lv2ReadyPill {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.07em;
    padding: 4px 9px;
    border-radius: 999px;
  }
  .lv2ReadyPillOn {
    color: var(--gh-success, #22c55e);
    background: rgba(var(--gh-success-rgb, 34,197,94), 0.14);
    border: 1px solid rgba(var(--gh-success-rgb, 34,197,94), 0.40);
  }
  .lv2ReadyPillOff {
    color: var(--gh-text-muted, rgba(255,255,255,0.5));
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--gh-border-subtle, rgba(255,255,255,0.08));
  }
  .lv2Kick {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid transparent;
    color: var(--gh-text-muted, rgba(255,255,255,0.5));
    cursor: pointer;
    transition: color 0.15s ease, background 0.15s ease;
  }
  .lv2Kick:hover {
    color: var(--gh-danger, #ef4444);
    background: rgba(var(--gh-danger-rgb, 239,68,68), 0.12);
  }
  .lv2SlotEmptyText {
    font-size: 12px;
    font-weight: 600;
    color: var(--gh-text-muted, rgba(255,255,255,0.5));
  }

  /* ── Invite rail ── */
  .lv2Search {
    position: relative;
    margin-bottom: 12px;
  }
  .lv2Search svg {
    position: absolute;
    left: 13px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--gh-text-muted, rgba(255,255,255,0.5));
    pointer-events: none;
  }
  .lv2SearchInput {
    width: 100%;
    box-sizing: border-box;
    background: var(--gh-bg-input, rgba(0,0,0,0.18));
    border: 1.5px solid var(--gh-border-default, rgba(255,255,255,0.12));
    border-radius: 12px;
    color: #fff;
    font-size: 13.5px;
    padding: 10px 13px 10px 39px;
    outline: none;
    font-family: inherit;
    transition: border-color 0.15s ease;
  }
  .lv2SearchInput:focus { border-color: rgba(var(--gh-teal-rgb, 34,211,238), 0.6); }
  .lv2SearchInput::placeholder { color: var(--gh-text-tertiary, rgba(255,255,255,0.45)); }

  .lv2Rail {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: none;
  }
  .lv2Rail::-webkit-scrollbar { display: none; }
  .lv2Pool {
    flex: 0 0 auto;
    width: 104px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    background: rgba(255, 255, 255, 0.045);
    border: 1px solid var(--gh-border-subtle, rgba(255,255,255,0.08));
    border-radius: 14px;
    padding: 13px 9px 11px;
  }
  .lv2PoolName {
    font-size: 11.5px;
    font-weight: 600;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .lv2AiTag {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: var(--gh-violet, #e879f9);
    background: rgba(var(--gh-violet-rgb, 232,121,249), 0.12);
    border: 1px solid rgba(var(--gh-violet-rgb, 232,121,249), 0.35);
    padding: 1px 7px;
    border-radius: 999px;
  }
  .lv2Invite {
    width: 100%;
    font-size: 11.5px;
    font-weight: 800;
    color: #06181c;
    background: var(--gh-teal, #22d3ee);
    border: none;
    border-radius: 9px;
    padding: 6px 0;
    cursor: pointer;
    font-family: inherit;
    transition: opacity 0.15s ease;
  }
  .lv2Invite:hover { opacity: 0.88; }
  .lv2InviteSent {
    background: rgba(var(--gh-success-rgb, 34,197,94), 0.20);
    color: var(--gh-success, #22c55e);
    cursor: default;
  }
  .lv2ShareTile {
    flex: 0 0 auto;
    width: 104px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: 14px;
    border: 1.5px dashed rgba(var(--gh-teal-rgb, 34,211,238), 0.4);
    background: rgba(var(--gh-teal-rgb, 34,211,238), 0.06);
    color: var(--gh-teal, #22d3ee);
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    padding: 13px 9px;
    transition: background 0.15s ease;
  }
  .lv2ShareTile:hover { background: rgba(var(--gh-teal-rgb, 34,211,238), 0.12); }

  /* ── Match setup ── */
  .lv2Modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 16px;
  }
  .lv2ModeBtn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 13px 10px 11px;
    border-radius: 15px;
    border: 1.5px solid var(--gh-border-subtle, rgba(255,255,255,0.08));
    background: rgba(255, 255, 255, 0.05);
    color: var(--gh-text-muted, rgba(255,255,255,0.5));
    cursor: pointer;
    font-family: inherit;
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }
  .lv2ModeBtnTop {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.06em;
  }
  .lv2ModeBtnSub { font-size: 11px; font-weight: 600; }
  .lv2ModeBtnOn[data-mode="async"] {
    color: #fff;
    border-color: rgba(var(--gh-teal-rgb, 34,211,238), 0.55);
    background: rgba(var(--gh-teal-rgb, 34,211,238), 0.13);
    box-shadow: 0 0 18px rgba(var(--gh-teal-rgb, 34,211,238), 0.18);
  }
  .lv2ModeBtnOn[data-mode="async"] .lv2ModeBtnTop { color: var(--gh-teal, #22d3ee); }
  .lv2ModeBtnOn[data-mode="sync"] {
    color: #fff;
    border-color: rgba(var(--gh-violet-rgb, 232,121,249), 0.55);
    background: rgba(var(--gh-violet-rgb, 232,121,249), 0.12);
    box-shadow: 0 0 18px rgba(var(--gh-violet-rgb, 232,121,249), 0.18);
  }
  .lv2ModeBtnOn[data-mode="sync"] .lv2ModeBtnTop { color: var(--gh-violet, #e879f9); }
  .lv2ModeBtnOn[data-mode="sync"] .lv2ModeBtnSub,
  .lv2ModeBtnOn[data-mode="async"] .lv2ModeBtnSub { color: rgba(255,255,255,0.7); }

  .lv2Setting { margin-bottom: 14px; }
  .lv2Setting:last-of-type { margin-bottom: 0; }
  .lv2SettingHead {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 8px;
  }
  .lv2SettingLabel {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--gh-text-secondary, rgba(255,255,255,0.6));
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .lv2SettingValue {
    margin-left: auto;
    font-size: 12.5px;
    font-weight: 800;
    color: var(--gh-orange, #fb923c);
  }
  .lv2Chips { display: flex; gap: 7px; flex-wrap: wrap; }
  .lv2Chip {
    font-size: 12px;
    font-weight: 700;
    padding: 6px 13px;
    border-radius: 999px;
    border: 1px solid var(--gh-border-default, rgba(255,255,255,0.12));
    background: rgba(255, 255, 255, 0.05);
    color: var(--gh-text-secondary, rgba(255,255,255,0.6));
    cursor: pointer;
    font-family: inherit;
    transition: all 0.14s ease;
  }
  .lv2Chip:hover { background: rgba(255,255,255,0.10); color: #fff; }
  .lv2ChipOn {
    color: #1a0a00;
    background: linear-gradient(135deg, var(--gh-orange, #fb923c), #e6502b);
    border-color: transparent;
    box-shadow: 0 3px 12px rgba(230, 80, 43, 0.35);
  }
  .lv2ChipOn:hover { color: #1a0a00; background: linear-gradient(135deg, var(--gh-orange, #fb923c), #e6502b); }

  .lv2Divider {
    height: 1px;
    background: var(--gh-border-subtle, rgba(255,255,255,0.08));
    margin: 16px -18px;
  }

  .lv2PickerHead {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
  }
  .lv2MiniLink {
    margin-left: auto;
    font-size: 11px;
    font-weight: 700;
    color: var(--gh-teal, #22d3ee);
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    padding: 0;
  }
  .lv2MiniLink:hover { text-decoration: underline; }

  .lv2PhotoChips { display: flex; gap: 8px; flex-wrap: wrap; }
  .lv2PhotoChip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 12px 5px 5px;
    border-radius: 999px;
    border: 1.5px solid var(--gh-border-default, rgba(255,255,255,0.12));
    background: rgba(255, 255, 255, 0.04);
    color: var(--gh-text-secondary, rgba(255,255,255,0.6));
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    overflow: hidden;
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }
  .lv2PhotoChip img {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    object-fit: cover;
    display: block;
    filter: saturate(0.55) brightness(0.75);
    transition: filter 0.15s ease;
  }
  .lv2PhotoChipOn {
    color: #fff;
    border-color: rgba(var(--gh-gold-rgb, 240,192,96), 0.6);
    background: rgba(var(--gh-gold-rgb, 240,192,96), 0.12);
  }
  .lv2PhotoChipOn img { filter: none; }
  .lv2PhotoChipCheck {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    display: none;
    align-items: center;
    justify-content: center;
    background: var(--gh-gold, #f0c060);
    color: #3a2703;
    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
  }
  .lv2PhotoChipOn .lv2PhotoChipCheck { display: inline-flex; }

  .lv2Summary {
    margin-top: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 12px;
    background: rgba(var(--gh-teal-rgb, 34,211,238), 0.07);
    border: 1px solid rgba(var(--gh-teal-rgb, 34,211,238), 0.22);
    font-size: 12px;
    font-weight: 600;
    color: var(--gh-text-secondary, rgba(255,255,255,0.6));
    line-height: 1.5;
  }
  .lv2Summary svg { flex-shrink: 0; color: var(--gh-teal, #22d3ee); }

  /* ── Sticky dock ── */
  .lv2Dock {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    padding: 14px clamp(14px, 3.5vw, 32px) calc(14px + env(safe-area-inset-bottom));
    background: linear-gradient(180deg, rgba(8, 12, 20, 0) 0%, rgba(8, 12, 20, 0.86) 34%, rgba(8, 12, 20, 0.97) 100%);
    backdrop-filter: blur(8px);
  }
  .lv2DockInner {
    max-width: 1080px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .lv2DockInfo { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .lv2DockCount {
    font-size: 14px;
    font-weight: 800;
    white-space: nowrap;
  }
  .lv2DockHint {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--gh-text-muted, rgba(255,255,255,0.5));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lv2DockHintAll { color: var(--gh-success, #22c55e); }
  .lv2ReadyBtn {
    margin-left: auto;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    min-width: 220px;
    padding: 14px 26px;
    border-radius: 999px;
    border: none;
    font-family: inherit;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
    color: var(--gh-btn-text, #1a0a00);
    background: linear-gradient(135deg, var(--gh-orange, #fb923c), #e6502b);
    box-shadow: 0 6px 22px rgba(230, 80, 43, 0.42), inset 0 1px 0 rgba(255,255,255,0.3);
    transition: transform 0.1s ease, box-shadow 0.18s ease;
  }
  .lv2ReadyBtn:active { transform: scale(0.97); }
  .lv2ReadyBtnOn {
    color: #04150a;
    background: linear-gradient(135deg, #4ade80, var(--gh-success, #22c55e));
    box-shadow: 0 6px 22px rgba(var(--gh-success-rgb, 34,197,94), 0.38), inset 0 1px 0 rgba(255,255,255,0.3);
  }
  @media (max-width: 560px) {
    .lv2DockInner { flex-direction: column; align-items: stretch; gap: 8px; }
    .lv2DockInfo { flex-direction: row; align-items: baseline; justify-content: space-between; }
    .lv2ReadyBtn { margin-left: 0; width: 100%; min-width: 0; }
  }
`;

export default function LobbyV2PrototypePage() {
  // ── Mock lobby state (local only) ──
  const [players, setPlayers] = useState<MockPlayer[]>(INITIAL_PLAYERS);
  const [mode, setMode] = useState<"async" | "sync">("sync");
  const [roundTimer, setRoundTimer] = useState(120);
  const [resultsTimer, setResultsTimer] = useState(30);
  const [deadlineDays, setDeadlineDays] = useState(3);
  const [eras, setEras] = useState<Set<EraId>>(new Set(ERAS.map((e) => e.id)));
  const [regions, setRegions] = useState<Set<RegionId>>(new Set(REGIONS.map((r) => r.id)));

  const [search, setSearch] = useState("");
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  const viewer = players.find((p) => p.id === VIEWER_ID) ?? null;
  const isHost = viewer?.isHost ?? false;
  const isReady = viewer?.ready ?? false;
  const readyCount = players.filter((p) => p.ready).length;
  const allReady = players.length > 0 && readyCount === players.length;
  const emptySlots = Math.max(0, MAX_SLOTS - players.length);

  const filteredPool = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inLobby = new Set(players.map((p) => p.id));
    return INVITE_POOL.filter(
      (p) => !inLobby.has(p.id) && (q === "" || p.name.toLowerCase().includes(q))
    ).slice(0, q === "" ? 8 : 12);
  }, [search, players]);

  const toggleReady = () =>
    setPlayers((prev) => prev.map((p) => (p.id === VIEWER_ID ? { ...p, ready: !p.ready } : p)));

  const kickPlayer = (id: string) => setPlayers((prev) => prev.filter((p) => p.id !== id));

  const sendInvite = (id: string) => {
    setInvited((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setInvited((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2500);
  };

  const copy = (kind: "link" | "code") => {
    try {
      navigator.clipboard?.writeText(
        kind === "code" ? ROOM_CODE : `https://guess-history.app/compete/${ROOM_CODE}`
      );
    } catch {
      /* ignore */
    }
    setCopied(kind);
    setTimeout(() => setCopied(null), 1800);
  };

  const toggleSet = <T extends string>(set: Set<T>, id: T, apply: (s: Set<T>) => void) => {
    if (set.has(id) && set.size === 1) return;
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  };

  const summary = `${eras.size} era${eras.size === 1 ? "" : "s"} · ${regions.size} region${
    regions.size === 1 ? "" : "s"
  } · ${mode === "sync" ? `${fmtTimer(roundTimer)} rounds · ${fmtTimer(resultsTimer)} results` : `${deadlineDays}d deadline${roundTimer > 0 ? ` · ${fmtTimer(roundTimer)}/round` : ""}`}`;

  return (
    <main className="lv2">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="lv2Proto">
        <span className="lv2ProtoTitle">
          <b>PROTOTYPE</b> · Lobby V2 — re-thought UIX
        </span>
        <span className="lv2ProtoHint">Mock data · you are host</span>
      </div>

      <div className="lv2Wrap">
        {/* ── Header strip ── */}
        <div className="lv2Top">
          <button className="lv2Back" onClick={() => window.history.back()} aria-label="Back">
            <ArrowLeft size={19} />
          </button>
          <span className="lv2Mode">
            <Users size={12} />
            COMPETE
          </span>
          <span className="lv2Live">
            <span className="lv2LiveDot" />
            Waiting for players
          </span>
        </div>

        {/* ── Room-code hero ── */}
        <section className="lv2Hero">
          <div className="lv2HeroLeft">
            <div className="lv2HeroKicker">Room code — share to invite</div>
            <div className="lv2Code">
              {ROOM_CODE.split("").map((c, i) => (
                <span key={i} className="lv2CodeChar">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="lv2HeroActions">
            <button
              className={`lv2CopyBtn ${copied === "link" ? "lv2Copied" : ""}`}
              onClick={() => copy("link")}
            >
              {copied === "link" ? <Check size={14} /> : <Link2 size={14} />}
              {copied === "link" ? "Link copied" : "Copy link"}
            </button>
            <button
              className={`lv2CopyBtn ${copied === "code" ? "lv2Copied" : ""}`}
              onClick={() => copy("code")}
            >
              {copied === "code" ? <Check size={14} /> : <Copy size={14} />}
              {copied === "code" ? "Code copied" : "Copy code"}
            </button>
          </div>
        </section>

        <div className="lv2Grid">
          {/* ── Left column: players + invite ── */}
          <div className="lv2Col">
            <section className="lv2Card">
              <div className="lv2CardHead">
                <span className="lv2Bar" />
                <h2 className="lv2CardTitle">
                  Players <span className="lv2Dim">({players.length}/{MAX_SLOTS})</span>
                </h2>
                <div className="lv2HeadRight">
                  <div className="lv2ReadyWrap">
                    <div className="lv2ReadyBar">
                      <div
                        className="lv2ReadyFill"
                        style={{ width: `${players.length ? (readyCount / players.length) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="lv2ReadyText">{readyCount} ready</span>
                  </div>
                </div>
              </div>

              <div className="lv2Slots">
                {players.map((p) => (
                  <div key={p.id} className={`lv2Slot ${p.ready ? "lv2SlotReady" : ""}`}>
                    <span className="lv2Avatar" style={{ background: gradientFor(p.id) }}>
                      {initialsOf(p.name)}
                      {p.isHost && (
                        <span className="lv2AvatarCrown">
                          <Crown size={10} strokeWidth={2.6} />
                        </span>
                      )}
                    </span>
                    <div className="lv2SlotMeta">
                      <span className="lv2SlotName">
                        {p.name}
                        {p.id === VIEWER_ID && <span className="lv2You">YOU</span>}
                      </span>
                      <span className="lv2SlotSub">{p.isHost ? "Host" : "Player"}</span>
                    </div>
                    <span className={`lv2ReadyPill ${p.ready ? "lv2ReadyPillOn" : "lv2ReadyPillOff"}`}>
                      {p.ready ? "READY" : "WAITING"}
                    </span>
                    {isHost && !p.isHost && (
                      <button className="lv2Kick" onClick={() => kickPlayer(p.id)} aria-label={`Kick ${p.name}`}>
                        <X size={13} strokeWidth={2.6} />
                      </button>
                    )}
                  </div>
                ))}
                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div key={`empty-${i}`} className="lv2Slot lv2SlotEmpty">
                    <span className="lv2Avatar lv2AvatarEmpty">
                      <Users size={15} />
                    </span>
                    <span className="lv2SlotEmptyText">Open slot</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="lv2Card">
              <div className="lv2CardHead">
                <span className="lv2Bar" />
                <h2 className="lv2CardTitle">Invite players</h2>
              </div>

              <div className="lv2Search">
                <Search size={16} />
                <input
                  className="lv2SearchInput"
                  placeholder="Search players…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="lv2Rail">
                <button className="lv2ShareTile" onClick={() => copy("link")}>
                  {copied === "link" ? <Check size={20} /> : <Link2 size={20} />}
                  {copied === "link" ? "Copied!" : "Share link"}
                </button>
                {filteredPool.length === 0 ? (
                  <span className="lv2SlotEmptyText" style={{ padding: "20px 8px" }}>
                    No players found
                  </span>
                ) : (
                  filteredPool.map((p) => {
                    const sent = invited.has(p.id);
                    return (
                      <div key={p.id} className="lv2Pool">
                        <span className="lv2Avatar" style={{ background: gradientFor(p.id) }}>
                          {initialsOf(p.name)}
                        </span>
                        <span className="lv2PoolName">{p.name}</span>
                        {p.isAi ? (
                          <span className="lv2AiTag">AI · SOON</span>
                        ) : (
                          <button
                            className={`lv2Invite ${sent ? "lv2InviteSent" : ""}`}
                            onClick={() => sendInvite(p.id)}
                            disabled={sent}
                          >
                            {sent ? "Sent ✓" : "Invite"}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          {/* ── Right column: match setup ── */}
          <div className="lv2Col">
            <section className="lv2Card">
              <div className="lv2CardHead">
                <span className="lv2Bar" />
                <h2 className="lv2CardTitle">Match setup</h2>
              </div>

              <div className="lv2Modes">
                <button
                  data-mode="async"
                  className={`lv2ModeBtn ${mode === "async" ? "lv2ModeBtnOn" : ""}`}
                  onClick={() => setMode("async")}
                >
                  <span className="lv2ModeBtnTop">
                    <Hourglass size={15} />
                    ANYTIME
                  </span>
                  <span className="lv2ModeBtnSub">Play at your own pace</span>
                </button>
                <button
                  data-mode="sync"
                  className={`lv2ModeBtn ${mode === "sync" ? "lv2ModeBtnOn" : ""}`}
                  onClick={() => setMode("sync")}
                >
                  <span className="lv2ModeBtnTop">
                    <Zap size={15} />
                    LIVE
                  </span>
                  <span className="lv2ModeBtnSub">All at the same time</span>
                </button>
              </div>

              <div className="lv2Setting">
                <div className="lv2SettingHead">
                  <span className="lv2SettingLabel">
                    <Timer size={13} />
                    Round timer
                  </span>
                  <span className="lv2SettingValue">{fmtTimer(roundTimer)}</span>
                </div>
                <div className="lv2Chips">
                  {ROUND_TIMER_STEPS.map((v) => (
                    <button
                      key={v}
                      className={`lv2Chip ${roundTimer === v ? "lv2ChipOn" : ""}`}
                      onClick={() => setRoundTimer(v)}
                    >
                      {fmtTimer(v)}
                    </button>
                  ))}
                </div>
              </div>

              {mode === "sync" ? (
                <div className="lv2Setting">
                  <div className="lv2SettingHead">
                    <span className="lv2SettingLabel">
                      <Clock size={13} />
                      Results timer
                    </span>
                    <span className="lv2SettingValue">{fmtTimer(resultsTimer)}</span>
                  </div>
                  <div className="lv2Chips">
                    {RESULTS_TIMER_STEPS.map((v) => (
                      <button
                        key={v}
                        className={`lv2Chip ${resultsTimer === v ? "lv2ChipOn" : ""}`}
                        onClick={() => setResultsTimer(v)}
                      >
                        {fmtTimer(v)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="lv2Setting">
                  <div className="lv2SettingHead">
                    <span className="lv2SettingLabel">
                      <Clock size={13} />
                      Game deadline
                    </span>
                    <span className="lv2SettingValue">{deadlineDays}d</span>
                  </div>
                  <div className="lv2Chips">
                    {DEADLINE_STEPS.map((v) => (
                      <button
                        key={v}
                        className={`lv2Chip ${deadlineDays === v ? "lv2ChipOn" : ""}`}
                        onClick={() => setDeadlineDays(v)}
                      >
                        {v}d
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="lv2Divider" />

              <div className="lv2Setting">
                <div className="lv2PickerHead">
                  <span className="lv2SettingLabel">Eras</span>
                  <button
                    className="lv2MiniLink"
                    onClick={() =>
                      setEras(
                        eras.size === ERAS.length
                          ? new Set([ERAS[ERAS.length - 1].id])
                          : new Set(ERAS.map((e) => e.id))
                      )
                    }
                  >
                    {eras.size === ERAS.length ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="lv2PhotoChips">
                  {ERAS.map((e) => (
                    <button
                      key={e.id}
                      className={`lv2PhotoChip ${eras.has(e.id) ? "lv2PhotoChipOn" : ""}`}
                      onClick={() => toggleSet(eras, e.id, setEras)}
                    >
                      <img src={e.img} alt="" />
                      {e.label}
                      <span className="lv2PhotoChipCheck">
                        <Check size={9} strokeWidth={3.4} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="lv2Setting" style={{ marginTop: 14 }}>
                <div className="lv2PickerHead">
                  <span className="lv2SettingLabel">Regions</span>
                  <button
                    className="lv2MiniLink"
                    onClick={() =>
                      setRegions(
                        regions.size === REGIONS.length
                          ? new Set([REGIONS[REGIONS.length - 1].id])
                          : new Set(REGIONS.map((r) => r.id))
                      )
                    }
                  >
                    {regions.size === REGIONS.length ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="lv2PhotoChips">
                  {REGIONS.map((r) => (
                    <button
                      key={r.id}
                      className={`lv2PhotoChip ${regions.has(r.id) ? "lv2PhotoChipOn" : ""}`}
                      onClick={() => toggleSet(regions, r.id, setRegions)}
                    >
                      <img src={r.img} alt="" />
                      {r.label}
                      <span className="lv2PhotoChipCheck">
                        <Check size={9} strokeWidth={3.4} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="lv2Summary">
                <Sparkles size={14} />
                <span>{summary}</span>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* ── Sticky dock ── */}
      <div className="lv2Dock">
        <div className="lv2DockInner">
          <div className="lv2DockInfo">
            <span className="lv2DockCount">
              {readyCount}/{players.length} ready
            </span>
            <span className={`lv2DockHint ${allReady ? "lv2DockHintAll" : ""}`}>
              {allReady
                ? "Everyone is ready — starting soon"
                : isReady
                  ? "You're ready — waiting for the rest"
                  : "Tap ready when you're set"}
            </span>
          </div>
          <button
            className={`lv2ReadyBtn ${isReady ? "lv2ReadyBtnOn" : ""}`}
            onClick={toggleReady}
          >
            {isReady ? <Check size={18} strokeWidth={3} /> : <Zap size={17} />}
            {isReady ? "Ready" : "I'm ready"}
          </button>
        </div>
      </div>
    </main>
  );
}
