# Guess-History Documentation Index

This directory contains the living product, architecture, and operational documentation for Guess-History.

---

## Authoritative specs

| Document | Purpose |
|---|---|
| `GAME_MODES_SPEC.md` | Current mode contracts (Practice, Daily, Level Up, Compete Rush/Relax). |
| `GUESS_HISTORY_MASTER_SPEC.md` | Architectural master spec: event sourcing, replay contract, scoring model. |
| `DATABASE_SCHEMA_STATE.md` | Canonical schema and migration chain. |
| `HOME_PAGE_SPEC.md` | Current `/home` page UI and behavior. |
| `DAILY_MODE_SPEC.md` | Daily challenge contract. |
| `BADGE_SYSTEM.md` | Badge thresholds and feedback rules. |
| `STATS_SYSTEM.md` | XP, accuracy, and rank computation. |
| `KNOWN_CONSTRAINTS.md` | Architectural guardrails and constraints (KC list). |

## Core architecture

| Document | Purpose |
|---|---|
| `core/EVENT_STREAM_SPEC.md` | `round_events` / `player_round_events` and event schema. |
| `core/PHASE_FSM_SPEC.md` | Phase state machine (sync and async per-player). |
| `core/DETERMINISM_SPEC.md` | Deterministic reconstruction requirements. |
| `backend/scoring_spec.md` | Server-side scoring algorithm. |
| `backend/round_resolution.md` | Round/session resolution triggers. |

## Operations & tracking

| Document | Purpose |
|---|---|
| `CTO_BACKLOG.md` | Active task/bug tracker. |
| `PROGRESS.md` | Implementation log and milestone notes. |
| `WORKTREE_WORKFLOW.md` | How to work with the repo worktrees. |
| `DATABASE_CONNECTION.md` | Database connection notes. |

## Archive

Older or superseded documents live in `docs/archive/` and are kept for historical context only.

| Document | Note |
|---|---|
| `archive/AUDIT_REPORT_2025.md` | Legacy 2025 audit. |
| `archive/CODEBASE_AUDIT_REPORT_20260618.md` | June 2026 codebase audit (no longer reflects current state). |
| `archive/CORE_UI_AND_FEATURES_202604.md` | April 2026 home UI spec, superseded by `HOME_PAGE_SPEC.md`. |
| `archive/plans/EXECUTION_PLAN_20260511.md` | May 2026 execution plan (archived). |
| `archive/plans/MP-PLAN-COMPETE-AUDIT-FIX-001.md` | Compete audit fix plan (archived). |
| `archive/plans/PLAN_BATCH_UI_002.md` | Batch UI plan (archived). |
| `archive/plans/PROTOTYPE_ALIGNMENT_PLAN.md` | Prototype alignment plan (archived). |
| `archive/guess_history_home_page.html` | Static HTML prototype of the home page (archived). |
| `archive/prompt-template FOR CTO ONLY.txt` | Prompt template for CTO planning (archived). |
| `archive/artifacts/gh-fix-011b-final-logs.tar.gz` | Compressed log artifact from a past incident (archived). |

---

For the latest implementation, always prefer source code and the docs listed under **Authoritative specs** above.
