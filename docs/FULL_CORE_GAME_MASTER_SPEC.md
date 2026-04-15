Master Specification: Compete Mode as Core
Executive Summary
The Compete (multiplayer) mode is the unified core of the game system; all other modes (Practice, Solo, Tournaments, AI Opponents) are derived cases. This spec uses a server-authoritative architecture: the PartyKit server (Cloudflare Durable Object) manages all game state and logic
. Each player’s actions are logged in append-only tables, enabling idempotency and deterministic replay
. Key features include a shared-session data model, per-player commit logs, explicit sync/async timer rules, and robust persistence/reconnection via Postgres. The following sections detail legacy components, UI flow, data schema, timer logic, persistence, protocols, and a roadmap.

1. Legacy Inventory
PartyKit (Sync): server/lobby.ts – main durable-object code. Manages room state, players list, ready flags, host election (isHost()), and messaging. Incoming Zod-validated messages: join, toggle_ready, start_game, submit_guess, set_settings, kick_player, chat. Outgoing: roster_update, game_start, player_submitted, round_complete, advance_round, state_snapshot. Legacy used host-writer locks, which we will simplify into server logic.
PartyKit (Async): src/multiplayer/Server.ts – separate server for turn-based games. It persisted to Supabase (room_state) and used RPC messages (PLAYER_MOVE, PLAYER_READY_TOGGLE, START_GAME). We will consolidate into one engine.
Client Adapter: MultiplayerAdapter.ts – wraps WebSocket, reconnection. React pages: Lobby (CompeteLobbyPage.tsx), Results pages.
Leaderboard System (legacy) was client-side; we will compute scores server-side.
Database (Supabase): Key tables (legacy) included sync_room_players, room_rounds, sync_round_scores, round_results, sync_guess_events, session_players, partykit_logs, compete_host_diagnostics. We will create new tables for sessions, session_players, round_commits, round_results, and reuse partykit_logs for auditing. Auth/RLS: only the server (service role) can write; clients can SELECT only their own session/player rows.
2. Lobby & Room Flow
(The following paragraphs refer to user-provided UI screenshots.)
A player creates a room, becoming the host. The lobby UI shows fields like “Round Timer (e.g. 2m 00s)”, number of rounds, and “Year Range (-100 – 2026)”, plus an Invite section (room code HWGONB, shareable link). The host can filter friends list and invite them.

Players join by code/link and enter the lobby. The room lists all players and shows “Waiting for players (0/1 ready)”. Each player toggles Ready; only when all players are ready does the game start. The host then either clicks Start Game or it auto-starts.

Once the game starts, the lobby transitions to the game board. During gameplay, the host has no special authority (all game logic is server-handled). If the host disconnects before start, PartyKit’s transferHost() assigns a new host for configuration tasks.

3. Authoritative State Model

We split state into Session (shared) and Player (per-player) scopes. All mutations happen on the server.

**Core Specifications:**
- Event Stream: `docs/core/EVENT_STREAM_SPEC.md`
- Phase FSM: `docs/core/PHASE_FSM_SPEC.md`
- Determinism: `docs/core/DETERMINISM_SPEC.md`

3.1 Session (Shared) State
Configuration: (game_id, mode, round_timer_sec, total_rounds, year_min, year_max) stored in sessions.
Global timers: For sync mode, each round’s startAt timestamp; for async, a long-term session_deadline (now + D days).
Event sequence: List of event IDs or seeds for each round, fixed at game start.
3.2 Player (Per-Player) State
Submissions: Each player’s guess per round is logged in round_commits.
Results: Score, hints used for that round (calculated by server).
Each action is an immutable commit: key = (game_id, player_id, round_index).
3.3 Database Schema (DDL)
sql
Copy
CREATE TABLE sessions (
  game_id UUID PRIMARY KEY,
  mode VARCHAR NOT NULL,          -- 'sync' or 'async'
  round_timer_sec INT NOT NULL,
  total_rounds INT NOT NULL,
  year_min INT NOT NULL,
  year_max INT NOT NULL,
  session_deadline TIMESTAMP,     -- for async (Expires in days)
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE session_players (
  game_id UUID,
  player_id UUID,
  joined_at TIMESTAMP DEFAULT now(),
  left_at TIMESTAMP,
  PRIMARY KEY (game_id, player_id)
);

CREATE TABLE round_commits (
  game_id UUID,
  player_id UUID,
  round_index INT,
  submitted_at TIMESTAMP,
  year_guess INT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  hints_used INT,
  score INT,
  PRIMARY KEY (game_id, player_id, round_index)
);

CREATE TABLE round_results (
  game_id UUID,
  round_index INT,
  player_id UUID,
  score INT,
  rank INT,
  PRIMARY KEY (game_id, round_index, player_id)
);
We assume reasonable column types. The composite PK enforces idempotency: duplicate submissions are ignored
.

3.4 Data Model Diagram
has

contains

submits

aggregates

has

SESSIONS

SESSION_PLAYERS

ROUND_COMMITS

ROUND_RESULTS



Show code
4. Round Flow & Timer Rules
4.1 Sync Mode
Start Round: Server sends ROUND_START with startAt timestamp and round_timer_sec (short, e.g. 120s). All clients use this for the countdown.
First-Submission Pressure: On the first submit_guess of a round, server clamps remaining time to 20 seconds, broadcasting the change. Clients’ timers jump to 20s
.
Round End: Round ends when timer = 0 or all have submitted.
Results Screen: A 30-second results countdown begins. Each player sees their result and (partial) leaderboard. Next Round activates when either all players click Next or the 30s timer expires, forcing continuation.
4.2 Async Mode
Session Timer: At game start, set session_deadline = now + D days (e.g. D=1–7). This is a long global timer for the entire game; there is no per-round timer.
Turn Progression: Rounds effectively run as "simultaneous turns": each player independently submits. When one player submits, the server notifies others but does not halt their timers (they have none).
Results Screen: No countdown. Partial leaderboards build as players finish:
After the 1st player submits, they see their result (Next disabled).
After the 2nd submits, the first two see a 2-player leaderboard (Next still disabled).
After the last submits, all see the full leaderboard and Next becomes enabled for everyone.
4.3 Examples (Async)
For a 3-player async game:

Player A submits → UI shows A’s score (Next disabled).
Player B submits → A & B see scores for A and B (Next disabled).
Player C submits → A, B, C all see scores for A, B, C; Next now enabled.
No additional timing constraints are needed beyond the session deadline.

5. Persistence & Resilience
PartyKit (Durable Object) holds in-memory state: current round index, which players have submitted, active timers. It can hibernate when empty and wake on reconnect
.
Database Sync: After each round, the server writes all round_commits to the DB. Optionally write immediately on each submission in async mode. Compute scores server-side and write to round_results. Use transactions to ensure atomicity.
Reconnection: New or rejoining clients receive a STATE_SNAPSHOT from the server, containing session config and all past commits. They rebuild the UI from this. If the DO hibernated, it will load sessions, session_players, round_commits on wake.
Idempotency: PKs ensure double submissions do not duplicate. The server should check for existing commits before inserting.
AllReady

timeOut or allSubmitted

resultsTimer=0 or allNext (Sync) / allSubmitted (Async)

nextRound

finalRound

Lobby

Playing

RoundActive

RoundComplete

Next

GameOver



Show code
(State machine showing lobby→game→round→results transitions for both modes.)

6. Message Protocol
6.1 Client ⇒ Server (Schemas)
JOIN_ROOM: {type:"JOIN_ROOM", gameId, playerId}
LEAVE_ROOM: {type:"LEAVE_ROOM", gameId, playerId}
TOGGLE_READY: {type:"TOGGLE_READY", gameId, playerId, ready}
START_GAME: {type:"START_GAME", gameId, hostId} (host only)
SUBMIT_GUESS:
json
Copy
{
  "type":"SUBMIT_GUESS",
  "gameId":"...", "playerId":"...", "round":2,
  "year":1978, "lat":48.85, "lng":2.35, "hintsUsed":1
}
CHAT_MESSAGE: {type:"CHAT", playerId, message}
6.2 Server ⇒ Client
ROSTER_UPDATE: {type:"ROSTER_UPDATE", players:[{id,name,ready}]}
GAME_START: {type:"GAME_START", gameId, seed, totalRounds, roundTimer}
ROUND_START: {type:"ROUND_START", round, startAt, duration}
PLAYER_SUBMITTED: {type:"PLAYER_SUBMITTED", playerId}
ROUND_COMPLETE:
json
Copy
{
  "type":"ROUND_COMPLETE", "round":2,
  "results":[
     {"playerId":"alice","score":10,"accuracy":8,"hints":0},
     {"playerId":"bob","score":7,"accuracy":5,"hints":2}
  ]
}
ADVANCE_ROUND: {type:"ADVANCE_ROUND", nextRound}
STATE_SNAPSHOT: {type:"STATE_SNAPSHOT", session:{...}, commits:[...], players:[...], currentRound, timerLeft}
These payloads should be validated with the server-side schemas.

7. Determinism & Randomness
The simulation must be deterministic
. Use a fixed seed (shared in GAME_START) for any randomness.
Avoid any non-deterministic operations (no thread race, no non-locked DB reads). Clients never execute game logic, so server ensures uniform outcomes.
Floating-point maps (distance) are computed server-side or with identical math to avoid discrepancies.
8. Security & RLS
JWT Auth: Require a valid JWT on connect to identify playerId.
RLS: PartyKit service role can INSERT/UPDATE; players (authenticated role) can SELECT only their own rows in session_players, round_commits, round_results.
No Client Trust: The server computes all scores and tolerates incorrect/missing inputs from clients (e.g. late submits).
9. Scalability & Ops
Durable Object Limits: PartyKit DO storage is limited (128KB)
, so avoid storing large data in-memory. Use DB for history.
Global Scale: Each room is one DO; rooms scale independently on Cloudflare’s edge
. You can host millions of rooms.
DB Load: Low QPS – only commit writes per round. Use efficient keys and indexes.
Logging/Monitoring: Log major events to partykit_logs. Monitor error rates, liveness (games stuck vs total).
10. Migration & Roadmap
Keep: PartyKit infrastructure, lobby/ready UI, 20s pressure, leaderboards.
Change: Async mode logic as described, server-authoritative practice mode (no client-only mode). Drop legacy snapshot DB writes.
Roadmap: 1) Implement new tables and RLS; 2) Refactor server code to commit-based model; 3) Update client for async rules; 4) Test edge cases (disconnects, duplicates); 5) Roll out under flag.
Appendix A: Sample SQL DDL
(See section 3.3 above for full DDL.)

Appendix B: Message Types Table
Message	Direction	Description
JOIN_ROOM	Client→S	Join session with code
TOGGLE_READY	Client→S	Mark ready/unready
START_GAME	Client→S	(Host only) begin the game
SUBMIT_GUESS	Client→S	Send year/location guess
GAME_START	Server→C	Send initial game config
ROUND_START	Server→C	Begin a round (with timer info)
PLAYER_SUBMITTED	Server→C	Notify that a player submitted
ROUND_COMPLETE	Server→C	Round results and partial leaderboard
ADVANCE_ROUND	Server→C	Instruct next round or end game
STATE_SNAPSHOT	Server→C	Full state for reconnect/late-join

Appendix C: Diagrams
Session State Machine:

**CANONICAL FSM:** See `docs/core/PHASE_FSM_SPEC.md` Section 3

```
SESSION_CREATED  → ROUND_STARTED | SESSION_COMPLETE
ROUND_STARTED    → GUESS_SUBMITTED | ROUND_COMPLETE
GUESS_SUBMITTED  → GUESS_SUBMITTED | ROUND_COMPLETE
ROUND_COMPLETE   → ROUND_STARTED | SESSION_COMPLETE
SESSION_COMPLETE → (terminal)
```

ER Model: (see section 3.4 mermaid above)

Appendix D: QA Test Cases
Sync Pressure Test: Two players, start timer 120s. First submit should set remaining to 20s.
Sync Results Advance: Ensure 30s countdown allows auto-advance.
Async Flow: Three players submit sequentially; verify partial/complete leaderboards and Next enablement.
Disconnection: Player disconnects mid-game and reconnects; state snapshot re-syncs correctly.
Host Migration: Host disconnects before start; a new host is assigned and can start.
Duplicate Messages: Resend the same SUBMIT_GUESS; DB remains consistent (single record).
Sources: PartyKit architecture (Durable Objects, hibernation)
; authoritative server practices
; deterministic simulation
.