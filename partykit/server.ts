import {
  loadCompeteSessionSnapshot,
  submitGuess,
  advanceRound,
  getRoundResults,
  type SubmitGuessInput
} from "../src/server/sessionCore";

// Timer tick interval in milliseconds
const TIMER_TICK_INTERVAL_MS = 1000;

export type ServerMessage =
  | { type: "JOIN_ROOM"; playerId: string; displayName: string }
  | { type: "LEAVE_ROOM"; playerId: string }
  | { type: "TOGGLE_READY"; playerId: string; ready: boolean }
  | { type: "START_GAME"; playerId: string }
  | { type: "SUBMIT_GUESS"; playerId: string; roundIndex: number; year: number | null; lat: number | null; lng: number | null; hintsUsed: number }
  | { type: "REQUEST_SNAPSHOT"; playerId: string }
  | { type: "ADVANCE_ROUND"; playerId: string; roundIndex: number };

export type ClientMessage =
  | { type: "ROSTER_UPDATE"; players: Array<{ id: string; name: string; ready: boolean; isHost: boolean }> }
  | { type: "GAME_START"; gameId: string; seed: string; totalRounds: number; roundTimerSec: number }
  | { type: "ROUND_START"; round: number; startAt: string; durationSec: number; eventId: string }
  | { type: "PLAYER_SUBMITTED"; playerId: string; round: number }
  | { type: "ROUND_COMPLETE"; round: number; results: Array<{ playerId: string; score: number; accuracy: number; hints: number }> }
  | { type: "ADVANCE_ROUND"; nextRound: number | null }
  | { type: "STATE_SNAPSHOT"; session: unknown; commits: unknown[]; players: unknown[]; currentRound: number; timerLeft: number | null }
  | { type: "TIMER_TICK"; timeRemaining: number | null }
  | { type: "PRESSURE_APPLIED"; remainingSec: number }
  | { type: "ERROR"; message: string };

interface Room {
  id: string;
  broadcast: (message: string) => void;
}

interface Connection {
  id: string;
  send: (message: string) => void;
}

export default class GameServer {
  private timerInterval: NodeJS.Timeout | null = null;
  private lastBroadcastTimeRemaining: number | null = null;

  constructor(readonly room: Room) {}

  async onConnect(connection: Connection): Promise<void> {
    console.log("[PartyKit] Client connected:", connection.id);

    const gameId = this.room.id;
    const snapshot = await loadCompeteSessionSnapshot(gameId);

    if (snapshot) {
      const msg: ClientMessage = {
        type: "STATE_SNAPSHOT",
        session: snapshot.config,
        commits: [],
        players: snapshot.players,
        currentRound: snapshot.currentRoundIndex,
        timerLeft: snapshot.timeRemaining ?? null
      };
      connection.send(JSON.stringify(msg));
    }
  }

  async onClose(connection: Connection): Promise<void> {
    console.log("[PartyKit] Client disconnected:", connection.id);
  }

  private startTimerBroadcast(): void {
    if (this.timerInterval) {
      return; // Already running
    }

    this.timerInterval = setInterval(async () => {
      const gameId = this.room.id;
      const snapshot = await loadCompeteSessionSnapshot(gameId);

      const timeRemaining = snapshot?.timeRemaining ?? null;
      if (snapshot?.status === "ROUND_ACTIVE" && timeRemaining !== null) {
        // Only broadcast if time changed
        if (timeRemaining !== this.lastBroadcastTimeRemaining) {
          this.lastBroadcastTimeRemaining = timeRemaining;
          const timerMsg: ClientMessage = {
            type: "TIMER_TICK",
            timeRemaining
          };
          this.room.broadcast(JSON.stringify(timerMsg));
        }
      } else {
        // Stop timer if round not active or no time remaining
        this.stopTimerBroadcast();
      }
    }, TIMER_TICK_INTERVAL_MS);
  }

  private stopTimerBroadcast(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
      this.lastBroadcastTimeRemaining = null;
    }
  }

  async onMessage(message: string, sender: Connection): Promise<void> {
    try {
      const data = JSON.parse(message) as ServerMessage;
      const gameId = this.room.id;

      switch (data.type) {
        case "SUBMIT_GUESS": {
          const input: SubmitGuessInput = {
            gameId,
            playerId: data.playerId,
            roundIndex: data.roundIndex,
            yearGuess: data.year,
            locationGuess: data.lat !== null && data.lng !== null ? { lat: data.lat, lng: data.lng } : null,
            hintsUsed: [],
            _executionContext: "partykit"
          };

          const snapshot = await submitGuess(input);

          const playerSubmittedMsg: ClientMessage = {
            type: "PLAYER_SUBMITTED",
            playerId: data.playerId,
            round: data.roundIndex
          };
          this.room.broadcast(JSON.stringify(playerSubmittedMsg));

          if (snapshot.timeRemaining && snapshot.timeRemaining <= 20) {
            const pressureMsg: ClientMessage = {
              type: "PRESSURE_APPLIED",
              remainingSec: snapshot.timeRemaining
            };
            this.room.broadcast(JSON.stringify(pressureMsg));
          }

          if (snapshot.status === "ROUND_COMPLETE") {
            const results = await getRoundResults(gameId, data.roundIndex);
            const roundCompleteMsg: ClientMessage = {
              type: "ROUND_COMPLETE",
              round: data.roundIndex,
              results: results.map(r => ({
                playerId: r.playerId,
                score: r.score,
                accuracy: r.accuracy,
                hints: 0
              }))
            };
            this.room.broadcast(JSON.stringify(roundCompleteMsg));
          }

          break;
        }

        case "ADVANCE_ROUND": {
          const snapshot = await advanceRound({
            gameId,
            playerId: data.playerId,
            roundIndex: data.roundIndex,
            _executionContext: "partykit"
          });

          const advanceMsg: ClientMessage = {
            type: "ADVANCE_ROUND",
            nextRound: snapshot.status === "SESSION_COMPLETE" ? null : snapshot.currentRoundIndex
          };
          this.room.broadcast(JSON.stringify(advanceMsg));

          if (snapshot.status !== "SESSION_COMPLETE") {
            const roundStartMsg: ClientMessage = {
              type: "ROUND_START",
              round: snapshot.currentRoundIndex,
              startAt: new Date().toISOString(),
              durationSec: snapshot.config.roundTimerSec,
              eventId: ""
            };
            this.room.broadcast(JSON.stringify(roundStartMsg));

            // Start timer broadcast for the new round
            this.startTimerBroadcast();
          } else {
            // Stop timer when session completes
            this.stopTimerBroadcast();
          }

          break;
        }

        case "REQUEST_SNAPSHOT": {
          const snapshot = await loadCompeteSessionSnapshot(gameId, data.playerId);
          if (snapshot) {
            const msg: ClientMessage = {
              type: "STATE_SNAPSHOT",
              session: snapshot.config,
              commits: [],
              players: snapshot.players,
              currentRound: snapshot.currentRoundIndex,
              timerLeft: snapshot.timeRemaining ?? null
            };
            sender.send(JSON.stringify(msg));
          }
          break;
        }

        default: {
          console.log("[PartyKit] Unhandled message type:", data.type);
        }
      }
    } catch (error) {
      console.error("[PartyKit] Error handling message:", error);
      const errorMsg: ClientMessage = {
        type: "ERROR",
        message: error instanceof Error ? error.message : "Unknown error"
      };
      sender.send(JSON.stringify(errorMsg));
    }
  }
}
