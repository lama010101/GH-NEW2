# GUESS-HISTORY — UNIFIED MASTER SPECIFICATION
### Single Source of Truth for AI-Assisted Implementation
**Version:** 3.0 FINAL  
**Status:** AUTHORITATIVE — Any deviation must be explicitly justified and documented  
**Audience:** AI coders and developers building the multiplayer game from scratch

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Non-Negotiable Foundations](#2-non-negotiable-foundations)
3. [System Architecture](#3-system-architecture)
4. [Legacy Inventory](#4-legacy-inventory)
5. [Lobby & Room Flow](#5-lobby--room-flow)
6. [Authoritative State Model](#6-authoritative-state-model)
7. [Database Schema (DDL)](#7-database-schema-ddl)
8. [Phase State Machine](#8-phase-state-machine)
9. [Round Flow & Timer Rules](#9-round-flow--timer-rules)
10. [Content System](#10-content-system)
11. [Answer & Submission Pipeline](#11-answer--submission-pipeline)
12. [Scoring Engine](#12-scoring-engine)
13. [Timer System](#13-timer-system)
14. [Networking Protocol](#14-networking-protocol)
15. [Persistence & Resilience](#15-persistence--resilience)
16. [Reconnect & Recovery](#16-reconnect--recovery)
17. [Late Join Policy](#17-late-join-policy)
18. [Host & Session Control](#18-host--session-control)
19. [Security, Anti-Cheat & RLS](#19-security-anti-cheat--rls)
20. [Determinism & Randomness](#20-determinism--randomness)
21. [Scalability & Ops](#21-scalability--ops)
22. [Implementation Roadmap](#22-implementation-roadmap)
23. [QA Test Cases](#23-qa-test-cases)
24. [Failure Conditions (System Invalidity)](#24-failure-conditions-system-invalidity)
25. [Appendix: Message Types Reference](#25-appendix-message-types-reference)
26. [Appendix: ER Model](#26-appendix-er-model)

---

## 1. Executive Summary

**Guess-History** is a multiplayer game where players guess the year and/or location of historical events. The **Compete (multiplayer) mode is the unified core**; all other modes (Practice, Solo, Tournaments, AI Opponents) are derived cases of the same system.

### Core Architectural Decisions

| Concern | Decision |
|---|---|
| Game authority | Server-authoritative (PartyKit Durable Object) |
| Source of truth | PostgreSQL (Supabase) — append-only commit log |
| Runtime executor | PartyKit Durable Object (deterministic, in-memory cache) |
| Client role | Stateless renderer only — sends intents, receives sanitized state |
| Randomness | Fixed seed + deterministic PRNG |
| Idempotency | Composite PKs on all commit tables |

---

## 2. Non-Negotiable Foundations

These rules are **constraints, not guidelines**. Any code that violates them reintroduces desync, cheating vectors, or unrecoverable sessions.

### 2.1 Authority Model

```
Database (Postgres)     = Absolute Source of Truth
Append-only logs        = Canonical game history
PartyKit Durable Object = Deterministic executor + runtime cache
Client                  = Stateless renderer
```

**The Golden Rule:**
> **No DB write = no state change.** If it's not persisted, it does not exist.

### 2.2 State Layers

#### Layer 1 — Persistent Truth (DB)
- `sessions`
- `session_players`
- `round_commits` (answers)
- `round_results`
- `round_events` (phase transitions, scoring)

#### Layer 2 — Runtime State (DO memory)
- Current phase
- Active timers
- Cached player list
- Derived state (leaderboard, submission counts)

> ⚠️ **Recovery Rule:** If the Durable Object crashes, **full state must be rebuildable from DB alone.**

### 2.3 Client Contract

The client:
- Receives **sanitized state only**
- **Never** receives correct answers before reveal
- **Never** receives hidden scoring data
- Sends only **intents** (actions), never state mutations

### 2.4 Determinism Guarantee

- Session has a fixed **seed** set at creation
- All randomness uses a seeded PRNG
- All transitions are event-driven (no hidden/implicit logic)
- Replay of commit log must produce **identical results**

---

## 3. System Architecture

### 3.1 Data Flow

```
Client
  │
  ▼ (action / intent)
PartyKit Durable Object
  │── validates action
  │── writes to DB (append-only)
  │── updates runtime state
  └── broadcasts sanitized state
         │
         ▼
      All Clients
```

### 3.2 Component Responsibilities

| Component | Responsibility |
|---|---|
| **Client** | Render UI, capture user input, send intent messages |
| **PartyKit DO** | Validate actions, enforce phase rules, manage timers, broadcast state |
| **PostgreSQL (Supabase)** | Persist all commits, results, events; source of truth for recovery |

---

## 4. Legacy Inventory

> For teams migrating from existing code. New builds can skip to Section 5.

### 4.1 Existing Files

| File | Description | Action |
|---|---|---|
| `server/lobby.ts` | PartyKit Durable Object — room state, players, ready flags, host election (`isHost()`), Zod-validated messages | **Refactor** into new commit-based model |
| `src/multiplayer/Server.ts` | Async/turn-based server — persisted to Supabase `room_state`, used RPC messages | **Consolidate** into single engine |
| `MultiplayerAdapter.ts` | Client WebSocket wrapper with reconnection logic | **Keep**, update message types |
| `CompeteLobbyPage.tsx` | Lobby React page | **Update** UI per new flow |

### 4.2 Legacy Message Types (Inbound to server)

`join`, `toggle_ready`, `start_game`, `submit_guess`, `set_settings`, `kick_player`, `chat`

### 4.3 Legacy Message Types (Outbound from server)

`roster_update`, `game_start`, `player_submitted`, `round_complete`, `advance_round`, `state_snapshot`

### 4.4 Legacy DB Tables (to be replaced)

`sync_room_players`, `room_rounds`, `sync_round_scores`, `round_results`, `sync_guess_events`, `session_players`, `partykit_logs`, `compete_host_diagnostics`

**Keep:** `partykit_logs` for auditing.  
**Replace all others** with the new schema in Section 7.

### 4.5 What Changes

| Was Wrong | Fix |
|---|---|
| Implicit in-memory authority risk | DB is now explicit source of truth |
| Replay not guaranteed | Append-only commit log guarantees replay |
| No commit log enforcement | All writes go through commit pipeline |
| Client-side leaderboard computation | Server computes all scores |
| Legacy snapshot DB writes | Replaced by commit-based model |

---

## 5. Lobby & Room Flow

### 5.1 Room Creation

1. A player creates a room — they become the **host**.
2. Host configures the game:
   - **Round Timer** (e.g. `2m 00s`)
   - **Number of Rounds**
   - **Year Range** (e.g. `-100` to `2026`)
3. An **Invite section** appears showing:
   - Room code (e.g. `HWGONB`)
   - Shareable link
   - Filterable friends list for direct invites

### 5.2 Joining

Players join by entering a room code or following a link. They enter the lobby which displays:
- All connected players
- Ready status for each player
- "Waiting for players (X/Y ready)"

### 5.3 Ready Flow

1. Each player independently toggles their **Ready** status.
2. The **Start Game** button is only available when **all players** are marked ready.
3. The host clicks Start Game (or it auto-starts when all are ready — configurable).

### 5.4 Game Start Transition

- Lobby transitions to game board.
- Once game starts, **host has no special in-game authority** — all logic is server-handled.
- Host role during a live game: cosmetic only.

### 5.5 Host Migration

If the host disconnects **before the game starts**, PartyKit's `transferHost()` assigns a new host so configuration tasks (start game) can still happen.

If the host disconnects **during a game**, a new host is assigned **deterministically** (e.g. next player in join order) for any remaining host-only actions.

---

## 6. Authoritative State Model

State is split into **Session (shared)** and **Player (per-player)** scopes. **All mutations happen on the server.**

### 6.1 Session (Shared) State

Stored in `sessions` table:

| Field | Description |
|---|---|
| `game_id` | UUID, primary key |
| `mode` | `'sync'` or `'async'` |
| `round_timer_sec` | Duration of each round timer (sync mode) |
| `total_rounds` | How many rounds in the game |
| `year_min` / `year_max` | Year range constraint |
| `session_deadline` | Async only: timestamp when the whole game expires |
| `seed` | Fixed random seed for deterministic question selection |

**Global timers:**
- **Sync mode:** Each round's `startAt` timestamp
- **Async mode:** `session_deadline = now + D days` (no per-round timer)

**Event sequence:** List of question IDs / seeds for each round, **fixed at game start** using the session seed.

### 6.2 Player (Per-Player) State

Each player's submission per round is an **immutable commit** in `round_commits`.  
Key: `(game_id, player_id, round_index)` — enforces idempotency; duplicates are ignored.

### 6.3 Phases Per Round

Every round has the following sub-phases (see Section 8 for full FSM):

```
LOBBY → STARTING → QUESTION → ANSWER → LOCKED → RESULT → SCOREBOARD → NEXT_ROUND / END
```

---

## 7. Database Schema (DDL)

```sql
-- Core session record
CREATE TABLE sessions (
  game_id           UUID PRIMARY KEY,
  mode              VARCHAR NOT NULL,         -- 'sync' or 'async'
  round_timer_sec   INT NOT NULL,
  total_rounds      INT NOT NULL,
  year_min          INT NOT NULL,
  year_max          INT NOT NULL,
  session_deadline  TIMESTAMP,                -- async: expiry timestamp
  seed              BIGINT NOT NULL,          -- deterministic PRNG seed
  created_at        TIMESTAMP DEFAULT now()
);

-- Players in each session
CREATE TABLE session_players (
  game_id     UUID,
  player_id   UUID,
  joined_at   TIMESTAMP DEFAULT now(),
  left_at     TIMESTAMP,
  PRIMARY KEY (game_id, player_id)
);

-- Append-only commit log: one row per player per round
-- Composite PK enforces idempotency — duplicate submissions are silently ignored
CREATE TABLE round_commits (
  game_id       UUID,
  player_id     UUID,
  round_index   INT,
  submitted_at  TIMESTAMP,
  year_guess    INT,
  location_lat  DOUBLE PRECISION,
  location_lng  DOUBLE PRECISION,
  hints_used    INT,
  score         INT,
  PRIMARY KEY (game_id, player_id, round_index)
);

-- Computed results per player per round
CREATE TABLE round_results (
  game_id      UUID,
  round_index  INT,
  player_id    UUID,
  score        INT,
  rank         INT,
  PRIMARY KEY (game_id, round_index, player_id)
);

-- Phase transition event log — every transition persisted here
CREATE TABLE round_events (
  event_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id      UUID NOT NULL,
  round_index  INT NOT NULL,
  phase        VARCHAR NOT NULL,  -- e.g. 'QUESTION', 'ANSWER', 'RESULT', etc.
  occurred_at  TIMESTAMP NOT NULL DEFAULT now(),
  metadata     JSONB              -- optional extra context
);

-- Audit / diagnostics log (reused from legacy)
CREATE TABLE partykit_logs (
  log_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     UUID,
  player_id   UUID,
  event_type  VARCHAR,
  payload     JSONB,
  logged_at   TIMESTAMP DEFAULT now()
);
```

### 7.1 Index Recommendations

```sql
CREATE INDEX idx_round_commits_game    ON round_commits (game_id, round_index);
CREATE INDEX idx_round_results_game    ON round_results (game_id, round_index);
CREATE INDEX idx_round_events_game     ON round_events  (game_id, round_index);
CREATE INDEX idx_session_players_game  ON session_players (game_id);
```

### 7.2 Idempotency Rules

- Composite PKs on `round_commits` and `round_results` prevent duplicate rows.
- Server **must check for existing commits before inserting** and silently discard duplicates.
- Each phase transition event has a **unique event_id** — re-running a transition must not duplicate effects.

---

## 8. Phase State Machine

### 8.1 Phases (Strict Order)

| # | Phase | Description |
|---|---|---|
| 1 | `LOBBY` | Players join, toggle ready |
| 2 | `STARTING` | Host clicked start, game initializing |
| 3 | `QUESTION` | Question displayed, players can see the prompt |
| 4 | `ANSWER` | Players submit their guesses |
| 5 | `LOCKED` | Submission window closed, no more writes |
| 6 | `RESULT` | Individual results shown |
| 7 | `SCOREBOARD` | Leaderboard shown |
| 8 | `NEXT_ROUND` / `END` | Proceed to next round or game over |

### 8.2 Phase Rules

Every phase **must** have:
- `phaseStartAt` — server timestamp when phase began
- `phaseEndsAt` — server timestamp when phase automatically ends

**Server time is authoritative.** Clients display countdowns derived from server timestamps using a computed offset.

All phase transitions **must be logged** to `round_events`.

### 8.3 High-Level Session FSM

```
AllReady / HostStartGame
         │
         ▼
       LOBBY ──────────────────────────────────────────────────────────┐
         │                                                              │
         ▼                                                              │
     STARTING                                                           │
         │                                                              │
         ▼                                                              │
    QUESTION ──► ANSWER ──► LOCKED ──► RESULT ──► SCOREBOARD           │
                                                       │                │
                                            [more rounds]  [last round] │
                                                       │                │
                                                  NEXT_ROUND          END
                                                       │
                                                    QUESTION (loop)
```

### 8.4 Transition Execution Model (DO Loop)

```pseudocode
if (now >= phaseEndsAt):
    validate_transition()
    write_event_to_DB(round_events)
    compute_next_phase()
    update_runtime_state()
    broadcast_sanitized_state()
```

---

## 9. Round Flow & Timer Rules

### 9.1 Sync Mode

Sync mode has a **per-round countdown timer** visible to all players simultaneously.

#### Round Start
- Server emits `ROUND_START` with:
  - `startAt` — server timestamp
  - `duration` — `round_timer_sec` (e.g. 120 seconds)
- All clients use `startAt + duration` to display synchronized countdown.

#### First-Submission Pressure Mechanic
- When the **first** player submits in a round, the server **clamps remaining time to 20 seconds** and broadcasts the change.
- All clients' timers jump to 20 seconds.
- This creates urgency for remaining players.

#### Round End
Round ends when **either**:
- Timer reaches 0, **or**
- All players have submitted

#### Results Screen (Sync)
- A **30-second results countdown** begins.
- Each player sees their individual result and a partial leaderboard.
- Next round activates when **either**:
  - All players click "Next", **or**
  - The 30-second timer expires (forces continuation)

### 9.2 Async Mode

Async mode has **no per-round timer**. There is only a long-term session deadline.

#### Session Timer
```
session_deadline = game_start_time + D days    (D configurable, e.g. 1–7 days)
```

Players submit their rounds independently at any time before the deadline.

#### Simultaneous Turns
- Rounds run as "simultaneous turns."
- When one player submits, the server **notifies other players** but does not halt anything.
- No countdown pressure exists.

#### Results Screen (Async) — Partial Leaderboard Build

The Results screen progressively fills as players submit:

| State | What Players See | "Next" Button |
|---|---|---|
| After 1st player submits | 1st player sees their own result only | Disabled |
| After 2nd player submits | 1st and 2nd see 2-player leaderboard | Disabled |
| After **all** players submit | All see full leaderboard | **Enabled for everyone** |

#### Async Example (3-player game)

```
Player A submits → A sees their score. Next disabled.
Player B submits → A and B see A+B scores. Next disabled.
Player C submits → A, B, C all see full leaderboard. Next ENABLED.
```

No additional timing logic beyond the session deadline is needed for async.

---

## 10. Content System

### 10.1 Questions (MANDATORY — Phase 0 of implementation)

Questions are **loaded from DB before any game logic**. Each question has:

| Field | Description |
|---|---|
| `id` | Unique question ID |
| `correct_year` | The authoritative answer year |
| `difficulty` | Difficulty rating |
| `geo_data` | Location data (lat/lng, place name) |
| `image_url` / `media` | Visual asset(s) |
| `description` | Optional text prompt |

### 10.2 Deterministic Question Selection

```
questionIndex = PRNG(seed + roundNumber)
```

- `seed` is stored in `sessions` and shared in `GAME_START`
- All randomness goes through this PRNG — no other source of randomness
- The same seed + round number always produces the same question

---

## 11. Answer & Submission Pipeline

### 11.1 Client Sends

```json
{
  "type": "SUBMIT_GUESS",
  "gameId": "...",
  "playerId": "...",
  "round": 2,
  "year": 1978,
  "lat": 48.85,
  "lng": 2.35,
  "hintsUsed": 1
}
```

### 11.2 Server Flow

```
1. Validate: current phase == ANSWER
2. Validate: player has not already submitted this round
3. INSERT into round_commits (append-only, idempotent via composite PK)
4. If duplicate → silently ignore
5. Emit PLAYER_SUBMITTED to all clients
6. Check: if all players submitted → trigger round-end logic
```

### 11.3 Lock Phase

Once `LOCKED` phase begins:
- **No further writes** to `round_commits` for this round are accepted
- DO enforces this at runtime
- DB enforces this optionally via constraint window or check in server logic

---

## 12. Scoring Engine

### 12.1 Requirements

- Deterministic (same inputs always produce same output)
- Fully recomputable from DB data alone
- **Never** compute final scores only in memory

### 12.2 Flow

```
1. Fetch all round_commits for (game_id, round_index)
2. Compute distance / year accuracy per player
3. Normalize scores
4. Write results to round_results
5. Write scoring events to round_events
```

### 12.3 Score Computation Notes

- Distance calculations (geo scoring) must be done **server-side** using identical math to avoid floating-point discrepancies across clients.
- `hints_used` reduces the score per the configured penalty.
- Final score for a round is written to both `round_commits.score` and `round_results.score`.

---

## 13. Timer System

### 13.1 Rules

- **Single time source:** `serverTime` — clients never trust their own clock for game logic
- Clients compute a **server-client time offset** on connect and apply it to all display logic
- No client timers are trusted for any authoritative purpose

### 13.2 Fail-safe (DO Restart)

If the DO restarts mid-round:
1. Load `round_events` from DB to find last known `phaseStartAt`
2. Recompute `phaseEndsAt = phaseStartAt + phaseDuration`
3. Compare with `now()` to determine current state
4. Resume or complete the transition accordingly

### 13.3 Timer Values (Reference)

| Timer | Value | Notes |
|---|---|---|
| Round timer (sync) | Configurable, e.g. 120s | Set by host in lobby |
| First-submission pressure | 20s remaining | Triggered by first submit |
| Results screen (sync) | 30s | Auto-advances if not all clicked Next |
| Session deadline (async) | `now + D days` | D = 1–7, configurable |

---

## 14. Networking Protocol

### 14.1 Client → Server (Intent Messages)

All messages are validated server-side with Zod schemas.

#### JOIN_ROOM
```json
{ "type": "JOIN_ROOM", "gameId": "...", "playerId": "..." }
```

#### LEAVE_ROOM
```json
{ "type": "LEAVE_ROOM", "gameId": "...", "playerId": "..." }
```

#### TOGGLE_READY
```json
{ "type": "TOGGLE_READY", "gameId": "...", "playerId": "...", "ready": true }
```

#### START_GAME (host only)
```json
{ "type": "START_GAME", "gameId": "...", "hostId": "..." }
```

#### SUBMIT_GUESS
```json
{
  "type": "SUBMIT_GUESS",
  "gameId": "...",
  "playerId": "...",
  "round": 2,
  "year": 1978,
  "lat": 48.85,
  "lng": 2.35,
  "hintsUsed": 1
}
```

#### READY_NEXT
```json
{ "type": "READY_NEXT", "gameId": "...", "playerId": "..." }
```

#### CHAT_MESSAGE
```json
{ "type": "CHAT", "playerId": "...", "message": "..." }
```

---

### 14.2 Server → Client (Sanitized State)

**Critical:** Never include correct answers or hidden scoring data before reveal.

#### ROSTER_UPDATE
```json
{
  "type": "ROSTER_UPDATE",
  "players": [{ "id": "...", "name": "...", "ready": true }]
}
```

#### GAME_START
```json
{
  "type": "GAME_START",
  "gameId": "...",
  "seed": 123456,
  "totalRounds": 5,
  "roundTimer": 120
}
```

#### ROUND_START
```json
{
  "type": "ROUND_START",
  "round": 1,
  "startAt": "2024-01-01T12:00:00Z",
  "duration": 120
}
```

#### PLAYER_SUBMITTED
```json
{ "type": "PLAYER_SUBMITTED", "playerId": "..." }
```

#### ROUND_COMPLETE
```json
{
  "type": "ROUND_COMPLETE",
  "round": 2,
  "results": [
    { "playerId": "alice", "score": 10, "accuracy": 8, "hints": 0 },
    { "playerId": "bob",   "score": 7,  "accuracy": 5, "hints": 2 }
  ]
}
```

#### ADVANCE_ROUND
```json
{ "type": "ADVANCE_ROUND", "nextRound": 3 }
```

#### PHASE_CHANGE
```json
{
  "type": "PHASE_CHANGE",
  "phase": "ANSWER",
  "phaseStartAt": "2024-01-01T12:00:00Z",
  "phaseEndsAt":  "2024-01-01T12:02:00Z"
}
```

#### STATE_SNAPSHOT
```json
{
  "type": "STATE_SNAPSHOT",
  "session": { "gameId": "...", "totalRounds": 5, "mode": "sync", ... },
  "commits": [ ... ],
  "players": [ ... ],
  "currentRound": 2,
  "currentPhase": "ANSWER",
  "timerLeft": 87
}
```

#### ERROR
```json
{
  "type": "ERROR",
  "code": "INVALID_PHASE",
  "message": "Cannot submit guess during LOCKED phase",
  "recoverable": true
}
```

---

## 15. Persistence & Resilience

### 15.1 DO In-Memory State (Runtime Cache)

The Durable Object holds:
- Current round index
- Current phase + `phaseStartAt` / `phaseEndsAt`
- Which players have submitted this round
- Active timers (as scheduled alarms or computed offsets)
- Cached player list

> ⚠️ DO storage limit is **128KB**. Do not store large data (e.g. full question assets) in-memory. Use DB for history.

### 15.2 DB Sync

| Event | DB Action |
|---|---|
| Round submission received | Write to `round_commits` |
| Round ends | Write all `round_results` + `round_events` transition |
| Phase transitions | Write to `round_events` |
| Game start | Write `sessions`, `session_players` |
| Disconnect | Update `session_players.left_at` |

Use **transactions** to ensure atomicity on round completion writes.

### 15.3 DO Hibernation

- DO can hibernate when the room is empty
- On wake (reconnection), it **loads sessions, session_players, round_commits** from DB
- Fully rebuilds runtime state before broadcasting

---

## 16. Reconnect & Recovery

### 16.1 Flow

```
1. Client connects (fresh or reconnect)
2. Client sends JOIN_ROOM
3. DO checks if session exists in DB
4. DO rebuilds runtime state from DB (if not cached)
5. DO sends full STATE_SNAPSHOT to the reconnecting client
6. Client re-renders UI from snapshot
```

### 16.2 STATE_SNAPSHOT Contents

The snapshot must include:
- Full session config (`sessions` row)
- All `round_commits` for all past rounds
- Current player list with ready/connected status
- Current round index
- Current phase
- Remaining timer value (computed from `phaseEndsAt - now`)

### 16.3 Mid-Round Reconnect

If a player reconnects mid-round:
- They receive `STATE_SNAPSHOT`
- If they had already submitted, their submission is in `round_commits` — no re-submit needed
- If they hadn't submitted, they can still submit (phase permitting)

---

## 17. Late Join Policy

| Timing | Policy |
|---|---|
| Before `QUESTION` phase | Allowed — player added to `session_players`, receives snapshot |
| During or after `QUESTION` phase | **Rejected** OR placed in **spectator mode** |

Spectator mode: player can watch but cannot submit guesses or affect scoring.

---

## 18. Host & Session Control

### 18.1 Host Role

The host is **only used for:**
- Starting the game (`START_GAME` message)
- Kicking players (optional feature)

The host has **no authority over game logic** once the game has started.

### 18.2 Host Migration

```
If host disconnects before game starts:
    assign host = next player in deterministic join order
    notify all clients via ROSTER_UPDATE

If host disconnects during game:
    no action needed (host has no in-game authority)
    optionally assign new host for lobby-like features
```

---

## 19. Security, Anti-Cheat & RLS

### 19.1 JWT Authentication

- Require a valid JWT on WebSocket connect
- JWT identifies `playerId`
- All server-side actions are validated against the authenticated `playerId`

### 19.2 Row-Level Security (Supabase RLS)

| Table | Service Role (PartyKit) | Authenticated User |
|---|---|---|
| `sessions` | INSERT / UPDATE / SELECT | SELECT own sessions |
| `session_players` | INSERT / UPDATE / SELECT | SELECT own rows |
| `round_commits` | INSERT / SELECT | SELECT own rows |
| `round_results` | INSERT / SELECT | SELECT own rows |
| `round_events` | INSERT / SELECT | No direct access |

**Rule:** Only the PartyKit server (service role) can write. Clients can only `SELECT` their own data.

### 19.3 Anti-Cheat Guarantees

- **No client authority** — server computes all scores, enforces all rules
- **Append-only logs** — past commits cannot be modified
- **Idempotent writes** — duplicate submissions have no effect
- **Server validation on every action** — invalid phases, unauthorized players, out-of-range values all rejected
- **No hidden state leaks** — correct answers never sent to clients before reveal
- **Late/missing inputs tolerated** — server handles missing submissions gracefully (score of 0 or timeout score)

---

## 20. Determinism & Randomness

### 20.1 Rules

- **One seed per session**, fixed at game creation
- All randomness (question selection, tie-breaking) uses `PRNG(seed + context)`
- No non-deterministic operations (no race conditions on DB reads, no `Math.random()`)
- Clients **never execute game logic** — no client-side randomness

### 20.2 Question Selection

```javascript
// Deterministic question selection
const questionIndex = seededPRNG(session.seed + roundNumber);
const question = questionPool[questionIndex % questionPool.length];
```

### 20.3 Floating-Point Safety

- All distance/geo calculations happen **server-side**
- Use identical math library across all server computations
- Never rely on client-reported computed values

---

## 21. Scalability & Ops

### 21.1 Infrastructure

| Concern | Approach |
|---|---|
| **Scale** | Each room = 1 Durable Object. Scale independently on Cloudflare edge |
| **Capacity** | Millions of concurrent rooms supported |
| **DB Load** | Low QPS — only commit writes per round + events |
| **DO Memory** | Keep small (<128KB). Store history in DB only |

### 21.2 Monitoring

- Log all major events to `partykit_logs`
- Monitor:
  - Error rates per message type
  - Stuck games (games with no activity for >2× round timer)
  - Reconnect frequency
  - DB write latency

### 21.3 Indexes

See Section 7.1 for recommended DB indexes.

---

## 22. Implementation Roadmap

Phases must be implemented in this order. Do not skip or reorder.

### Phase 0 — Content System *(FIRST)*
- Set up `questions` table in DB
- Question loading + validation
- Test deterministic question selection with PRNG

### Phase 1 — DB + Commit Log Layer
- Create all tables: `sessions`, `session_players`, `round_commits`, `round_results`, `round_events`
- Implement RLS policies
- Implement idempotency (composite PKs, duplicate handling)

### Phase 2 — Session & Lobby (DO + DB sync)
- PartyKit DO: room creation, join, leave
- Lobby state: player list, ready flags
- Host election and migration
- DB: write `sessions`, `session_players` on game start

### Phase 3 — Phase State Machine
- Implement all 8 phases
- Phase transition logging to `round_events`
- Transition validation (no skipping phases)

### Phase 4 — Timer System
- Server-authoritative timer broadcast
- `phaseStartAt` / `phaseEndsAt` on all phases
- DO alarm-based phase advancement
- Fail-safe timer recomputation from DB on restart

### Phase 5 — Answer Pipeline (commit-based)
- `SUBMIT_GUESS` → validate → insert `round_commits`
- Idempotency check
- `PLAYER_SUBMITTED` broadcast
- First-submission 20s pressure mechanic (sync only)

### Phase 6 — Scoring Engine (DB-driven)
- Compute scores from `round_commits`
- Write `round_results`
- Verify recomputability from DB alone

### Phase 7 — Networking Protocol
- Implement all message types from Section 14
- Zod schema validation on all inbound messages
- Sanitized state broadcast (no leaking answers)

### Phase 8 — Reconnect & Recovery
- `STATE_SNAPSHOT` generation from DB
- DO hibernation + wake flow
- Mid-round reconnect handling

### Phase 9 — Thin Client Refactor
- Remove any remaining client-side game logic
- Client is pure renderer + intent sender
- Validate: no client state influences server

---

## 23. QA Test Cases

### 23.1 Sync Pressure Test
- Setup: 2 players, round timer = 120s
- Action: First player submits
- Expected: Server clamps remaining time to 20s, broadcasts to both clients

### 23.2 Sync Results Auto-Advance
- Setup: Round complete, results screen open
- Action: Neither player clicks Next
- Expected: After 30s, server auto-advances to next round

### 23.3 Async Partial Leaderboard (3 players)
- Action: Players A, B, C submit sequentially
- Expected:
  - After A: A sees result, Next disabled
  - After B: A+B see 2-player leaderboard, Next disabled
  - After C: All see full leaderboard, Next enabled

### 23.4 Disconnection Mid-Round
- Action: Player disconnects mid-round, reconnects after round ends
- Expected: `STATE_SNAPSHOT` sent on reconnect; player sees correct results; no desync

### 23.5 Host Migration (Pre-Start)
- Action: Host disconnects before clicking Start Game
- Expected: New host deterministically assigned; game can still be started

### 23.6 Duplicate Submission
- Action: Same `SUBMIT_GUESS` sent twice (same `gameId`, `playerId`, `round`)
- Expected: DB unchanged after second submission; `round_commits` has exactly 1 row

### 23.7 Late Submission (Post-Lock)
- Action: Player submits after `LOCKED` phase begins
- Expected: Server rejects submission with `ERROR { code: "INVALID_PHASE", recoverable: true }`

### 23.8 DO Restart Mid-Round
- Action: Artificially restart DO while round is in `ANSWER` phase
- Expected: DO rebuilds state from DB; timers recomputed; players can still submit (if time remains)

### 23.9 Score Recomputation
- Action: Wipe DO memory, trigger score recomputation from DB
- Expected: `round_results` matches original in-memory scores exactly

### 23.10 Async Session Deadline
- Setup: `session_deadline` = 1 minute in the future
- Action: Deadline passes with players mid-game
- Expected: Server closes session, writes final `round_results` for submitted rounds, others score 0

---

## 24. Failure Conditions (System Invalidity)

The system is **INVALID** if any of the following occur:

| Condition | Why It Breaks the System |
|---|---|
| Any state mutation bypasses DB | Session becomes unrecoverable on DO crash |
| Any randomness is non-deterministic | Replay produces different results; replay guarantee lost |
| Any client influences game state | Cheating vector opened |
| Any phase transition is not logged in `round_events` | Cannot audit or replay game history |
| Any score cannot be recomputed from DB alone | Scoring is untrustworthy |
| Correct answers sent to client before reveal | Anti-cheat broken |
| Timer authority delegated to client | Timer desync, cheating vector |

---

## 25. Appendix: Message Types Reference

| Message | Direction | Description |
|---|---|---|
| `JOIN_ROOM` | Client → Server | Join session with room code |
| `LEAVE_ROOM` | Client → Server | Leave session |
| `TOGGLE_READY` | Client → Server | Mark player ready/unready |
| `START_GAME` | Client → Server | Host-only: begin the game |
| `SUBMIT_GUESS` | Client → Server | Send year/location guess |
| `READY_NEXT` | Client → Server | Player ready for next round |
| `CHAT` | Client → Server | Chat message |
| `ROSTER_UPDATE` | Server → Client | Player list with ready states |
| `GAME_START` | Server → Client | Initial game config (seed, rounds, timer) |
| `ROUND_START` | Server → Client | Begin a round with timer info |
| `PLAYER_SUBMITTED` | Server → Client | Notify all that a player submitted |
| `ROUND_COMPLETE` | Server → Client | Round results and partial leaderboard |
| `ADVANCE_ROUND` | Server → Client | Instruct clients: next round or end |
| `PHASE_CHANGE` | Server → Client | Phase transition with timestamps |
| `STATE_SNAPSHOT` | Server → Client | Full state for reconnect/late-join |
| `ERROR` | Server → Client | Standardized error with code + recoverable flag |

---

## 26. Appendix: ER Model

```
SESSIONS
  ├── game_id (PK)
  ├── mode, round_timer_sec, total_rounds
  ├── year_min, year_max, seed
  └── session_deadline

SESSION_PLAYERS
  ├── (game_id, player_id) (PK)
  └── joined_at, left_at
      └── FK → sessions.game_id

ROUND_COMMITS           [append-only]
  ├── (game_id, player_id, round_index) (PK)
  ├── submitted_at, year_guess
  ├── location_lat, location_lng
  ├── hints_used, score
  └── FK → sessions.game_id

ROUND_RESULTS
  ├── (game_id, round_index, player_id) (PK)
  ├── score, rank
  └── FK → sessions.game_id

ROUND_EVENTS            [append-only audit log]
  ├── event_id (PK)
  ├── game_id, round_index
  ├── phase, occurred_at
  └── metadata (JSONB)

PARTYKIT_LOGS           [diagnostics]
  ├── log_id (PK)
  ├── game_id, player_id
  ├── event_type, payload
  └── logged_at
```

---

## Final Directive

This document is a **constraint system**, not a set of suggestions.

If any implementation "simplifies" the persistence model, client-authority rules, phase logging, or scoring guarantees, it will reintroduce:

- Session desync
- Cheating vectors
- Unrecoverable crashed games
- Inconsistent or tampered scoring

**v1.1** had excellent gameplay structure but weak persistence guarantees.  
**v2.0** had correct architecture but an incomplete execution model.  
**This v3.0 is the minimum viable production-grade system.**

Cutting corners from this version means the system **will** break under real players — not "maybe." Build it right the first time.

---

*Spec version 3.0 — Guess-History Multiplayer Core — compiled from FULL_CORE_GAME_MASTER_SPEC.md + MASTER_IMPLEMENTATION_PLAN___MULTIPLAYER_CORE.md*
