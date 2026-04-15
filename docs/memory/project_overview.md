# Guess-History Project Overview

## System Maturity Status

**Current Phase:** v6 — Core Spec Authority Enforcement  
**Last Updated:** 2026-04-08  
**Authority:** MASTER IMPLEMENTATION PLAN — MULTIPLAYER CORE v3.0

---

## Core Specifications

| Spec | File | Purpose |
|------|------|---------|
| Event Stream | `docs/core/EVENT_STREAM_SPEC.md` | Canonical event model, ordering, replay |
| Phase FSM | `docs/core/PHASE_FSM_SPEC.md` | Deterministic phase transitions |
| Determinism | `docs/core/DETERMINISM_SPEC.md` | PRNG, time, replay guarantees |

---

## Maturity Levels

| Level | Name | Status | Task |
|-------|------|--------|------|
| v1 | Practice Mode Scaffold | COMPLETE | MP-CORE-LOOP-001 |
| v2 | Same-Transaction Verification | DEPRECATED | MP-CORE-LOOP-002 |
| v3 | Cross-Connection Zero-Trust | COMPLETE | MP-CORE-LOOP-003 |
| v3.5 | Schema Hard Reset | COMPLETE | MP-DB-RESET-ENFORCE-001 |
| v4 | Execution Proof Layer | COMPLETE | MP-CORE-LOOP-004 |
| v5 | Hard-Enforced Real DB Execution | COMPLETE | MP-CORE-LOOP-005 |
| v5.1 | DB Reconstruction Layer | COMPLETE | MP-CORE-LOOP-005 |
| v5.2 | Event Stream Invariant Enforcement | COMPLETE | MP-CORE-LOOP-006 |
| **v6** | **Core Spec Authority Enforcement** | **COMPLETE** | **DOC-CORE-001** |

## Replay Integrity Status

**Replay Integrity: ENFORCED** (MP-CORE-LOOP-006 + DOC-CORE-001)

- ✅ Strict chronological ordering validation (`docs/core/EVENT_STREAM_SPEC.md`)
- ✅ Strict round continuity (no skips, no regressions)
- ✅ Formal Phase FSM validator (`docs/core/PHASE_FSM_SPEC.md`)
- ✅ Null/undefined/invalid round rejection
- ✅ Input immutability protection
- ✅ Deterministic replay guaranteed (`docs/core/DETERMINISM_SPEC.md`)
- ✅ Core specs centralized and canonical

---

## Current System Capabilities

### Backend Infrastructure

* **Database:** Supabase PostgreSQL (REAL — no mocks)
* **Connection:** Direct pg.Pool with SSL
* **Schema:** 5 multiplayer tables (sessions, session_players, round_commits, round_results, round_events)
* **RLS:** Enabled on all tables
* **Migrations:** Mandatory gate — 16 migrations applied

### Zero-Trust Verification (v3 + v4 + v5)

| Component | Status | Location |
|-----------|--------|----------|
| Cross-Connection Verification | ACTIVE | `src/server/db.ts` |
| Row Integrity Verification | ACTIVE | `src/server/db.ts` |
| Write-Set Verification | ACTIVE | `src/server/db.ts` |
| Uniqueness Invariant | ACTIVE | `src/server/db.ts` |
| Full Deterministic Replay | ACTIVE | `src/server/db.ts` |
| Execution Proof Harness | ACTIVE | `src/server/zeroTrust.execution.test.ts` |
| **Hard DB Enforcement** | **ACTIVE** | `src/server/db.ts` |
| **Transaction Isolation Proof** | **ACTIVE** | `src/server/db.ts` |
| **Backend PID Tracking** | **ACTIVE** | `src/server/db.ts` |

### Real-Time Multiplayer

* **PartyKit WebSocket:** Integrated
* **Sync Mode:** Real-time guess submission and round advancement
* **Pressure Mechanic:** 20s broadcast on first submission
* **Round Completion:** Ranked results broadcast

### Practice Mode

* **Client-Authoritative:** Reducer-based deterministic engine
* **Persistence:** PostgreSQL (game_sessions table)
* **Real Events:** DB-backed only, no mock fallback

---

## Anti-Fake Guarantees

The Execution Proof Layer v5 (MP-CORE-LOOP-005) enforces:

1. **Hard DB Enforcement:** System CRASHES at module load if DB not connected
2. **Real DB Only:** No in-memory DB, no SQLite, no mocks
3. **Cross-Connection Verification:** Writes on Conn A, reads on Conn B with different backend PIDs
4. **Transaction Isolation Proof:** Uncommitted writes NOT visible to other connections
5. **Unforgeable Proofs v2:** DB_EXECUTION_PROOF blocks with backend PIDs, transaction IDs, timestamps
6. **Deterministic Replay:** Full recomputation from DB matches stored results exactly
7. **Corruption Detection:** All 9 test scenarios validate failure modes

### Verification Test Matrix (9 Tests)

| Test | Scenario | Expected | Proof |
|------|----------|----------|-------|
| 1 | Baseline | PASS | All verifications succeed |
| 2 | Payload Corruption | FAIL | `verifyRowIntegrity` detects UPDATE |
| 3 | Missing Write | FAIL | `verifyWriteSet` detects missing rows |
| 4 | Duplicate Insert | FAIL | PK + `verifyUniquenessInvariant` |
| 5 | Token Mismatch | FAIL | Wrong token rejected |
| 6 | Replay Drift | FAIL | `verifyFullReplay` detects drift |
| 7 | Deterministic Replay | PASS | Exact match DB-only recompute |
| 8 | **Transaction Isolation** | **PASS** | **Uncommitted not visible to B** |
| 9 | **Hard Enforcement** | **PASS** | **DB required at module load** |

---

## Architecture Principles

### Non-Negotiable Foundation

* **Postgres DB = Absolute Source of Truth**
* **Append-only tables = Canonical history**
* **PartyKit DO = Deterministic executor ONLY**
* **Client = Stateless renderer**
* **Execution Proof = Immutable verification record**

### Core Invariant

> **NO DB WRITE = NO STATE CHANGE**

* Every state transition backed by verified DB write
* In-memory mutations without persistence = INVALID
* Verification failures = HARD CRASH
* Missing execution proof = INVALID

---

## Key Files

| File | Purpose |
|------|---------|
| `src/server/db.ts` | Zero-Trust verification system |
| `docs/core/EVENT_STREAM_SPEC.md` | Event stream authority |
| `docs/core/PHASE_FSM_SPEC.md` | Phase FSM authority |
| `docs/core/DETERMINISM_SPEC.md` | Determinism authority |
| `src/server/getGameState.ts` | **Canonical read model — deterministic reconstruction with strict event stream validation** |
| `src/server/sessionCore.ts` | Multiplayer session operations |
| `src/server/zeroTrust.execution.test.ts` | Execution proof test harness |
| `partykit/server.ts` | WebSocket game server |
| `docs/memory/backend_architecture.md` | Architecture documentation |
| `docs/memory/operational_rules.md` | Runtime rules |

---

## Completed Milestones

| Milestone | Status | Target |
|-----------|--------|--------|
| Execution Proof Harness | ✅ COMPLETE | MP-CORE-LOOP-004 |
| DB Reconstruction Layer | ✅ COMPLETE | MP-CORE-LOOP-005 |

## Next Milestones

| Milestone | Status | Target |
|-----------|--------|--------|
| PartyKit Production Deploy | PENDING | — |
| Load Testing | PENDING | — |
| Async Mode Implementation | PENDING | — |
| FTUE Completion | PENDING | — |

---

## Validation Command

Run the execution proof harness:

```bash
npm run test zeroTrust.execution
```

All 9 scenarios must complete with real DB writes, transaction isolation proof, corruption detection, and execution proofs.

---
