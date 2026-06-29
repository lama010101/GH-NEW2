# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multiplayer-simulation.spec.ts >> Multiplayer Simulation >> resume-after-refresh: lobby, round-active, round-complete
- Location: scripts/test/playwright/specs/multiplayer-simulation.spec.ts:95:7

# Error details

```
Error: Timeout waiting for state match (120000ms)
```

# Test source

```ts
  192 |         } catch (err) {
  193 |           console.error(`[WS:${this.opts.user.displayName}] Failed to parse message:`, err);
  194 |         }
  195 |       });
  196 | 
  197 |       ws.on('close', (code: number, reason: Buffer) => {
  198 |         this.clearHeartbeat();
  199 |         console.log(`[WS:${this.opts.user.displayName}] Closed code=${code} reason=${reason.toString()}`);
  200 |         this.opts.onDisconnect?.();
  201 |         if (!this.manuallyClosed) {
  202 |           this.attemptReconnect().catch((err) => {
  203 |             if (!firstStateResolved) {
  204 |               firstStateResolved = true;
  205 |               reject(err);
  206 |             }
  207 |           });
  208 |         }
  209 |       });
  210 | 
  211 |       ws.on('error', (err: Error) => {
  212 |         console.error(`[WS:${this.opts.user.displayName}] Error:`, err.message);
  213 |         if (!firstStateResolved) {
  214 |           firstStateResolved = true;
  215 |           reject(err);
  216 |         }
  217 |       });
  218 |     });
  219 |     return this.connectPromise;
  220 |   }
  221 | 
  222 |   private attemptReconnect(): Promise<void> {
  223 |     if (this.reconnectAttempts >= this.maxReconnectAttempts) {
  224 |       return Promise.reject(new Error(`Max reconnect attempts reached for ${this.opts.user.displayName}`));
  225 |     }
  226 |     this.reconnectAttempts++;
  227 |     const delay = this.reconnectDelayMs * this.reconnectAttempts;
  228 |     console.log(`[WS:${this.opts.user.displayName}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
  229 |     return new Promise((resolve) => setTimeout(resolve, delay)).then(() => {
  230 |       this.connectPromise = null;
  231 |       return this.connect();
  232 |     });
  233 |   }
  234 | 
  235 |   private handleMessage(msg: ClientMessage, resolveOnce: () => void): void {
  236 |     switch (msg.type) {
  237 |       case 'STATE_UPDATE':
  238 |         this.lastSnapshot = msg.snapshot as CompeteSnapshot;
  239 |         this.snapshotHistory.push(this.lastSnapshot);
  240 |         if (this.snapshotHistory.length > CompeteWSClient.HISTORY_SIZE) {
  241 |           this.snapshotHistory.shift();
  242 |         }
  243 |         this.opts.onStateUpdate?.(this.lastSnapshot);
  244 |         resolveOnce();
  245 |         break;
  246 |       case 'ERROR':
  247 |         console.warn(`[WS:${this.opts.user.displayName}] ERROR: ${msg.message}`);
  248 |         this.opts.onError?.(msg.message);
  249 |         break;
  250 |       case 'PLAYER_SUBMITTED':
  251 |         this.opts.onPlayerSubmitted?.(msg.playerId, msg.playerName);
  252 |         break;
  253 |       case 'TIMER_CLAMPED':
  254 |         this.opts.onTimerClamped?.(msg.newPhaseEndsAt, msg.clampedToSec);
  255 |         break;
  256 |       case 'PLAY_AGAIN':
  257 |         this.opts.onPlayAgain?.(msg.newGameId);
  258 |         break;
  259 |     }
  260 |   }
  261 | 
  262 |   private send(msg: ServerMessage): void {
  263 |     if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
  264 |       console.warn(`[WS:${this.opts.user.displayName}] Cannot send — socket not open`);
  265 |       return;
  266 |     }
  267 |     this.ws.send(JSON.stringify(msg));
  268 |   }
  269 | 
  270 |   /** Wait for the next STATE_UPDATE matching a predicate. */
  271 |   waitForState(predicate: (s: CompeteSnapshot) => boolean, timeoutMs = 30000, skipHistory = false): Promise<CompeteSnapshot> {
  272 |     // Check the history buffer first — if any recent snapshot matches,
  273 |     // resolve immediately. This handles transient states (e.g.,
  274 |     // ROUND_COMPLETE round=2 → ROUND_ACTIVE round=3 in <1s) that were
  275 |     // received and advanced past before waitForState was called.
  276 |     // skipHistory=true bypasses this for predicates that must match the
  277 |     // CURRENT state only (e.g., waitForSubmissionAck which checks
  278 |     // hasSubmitted — a stale true from a previous round is a false positive).
  279 |     if (!skipHistory) {
  280 |       for (const snap of this.snapshotHistory) {
  281 |         if (predicate(snap)) {
  282 |           return Promise.resolve(snap);
  283 |         }
  284 |       }
  285 |     } else if (this.lastSnapshot && predicate(this.lastSnapshot)) {
  286 |       return Promise.resolve(this.lastSnapshot);
  287 |     }
  288 | 
  289 |     return new Promise((resolve, reject) => {
  290 |       const timer = setTimeout(() => {
  291 |         this.opts.onStateUpdate = originalHandler;
> 292 |         reject(new Error(`Timeout waiting for state match (${timeoutMs}ms)`));
      |                ^ Error: Timeout waiting for state match (120000ms)
  293 |       }, timeoutMs);
  294 | 
  295 |       const originalHandler = this.opts.onStateUpdate;
  296 |       this.opts.onStateUpdate = (snapshot: CompeteSnapshot) => {
  297 |         originalHandler?.(snapshot);
  298 |         if (predicate(snapshot)) {
  299 |           clearTimeout(timer);
  300 |           this.opts.onStateUpdate = originalHandler;
  301 |           resolve(snapshot);
  302 |         }
  303 |       };
  304 |     });
  305 |   }
  306 | 
  307 |   /**
  308 |    * Wait for a STATE_UPDATE confirming this player's guess was acknowledged
  309 |    * (hasSubmitted === true). Used by the orchestrator to detect rejected
  310 |    * guesses instead of fire-and-forget. (H17 fix — part 1)
  311 |    */
  312 |   waitForSubmissionAck(timeoutMs = 10000): Promise<CompeteSnapshot> {
  313 |     return this.waitForState(
  314 |       (s) => {
  315 |         const me = s.players.find((p) => p.playerId === this.opts.user.id);
  316 |         return me?.hasSubmitted === true;
  317 |       },
  318 |       timeoutMs,
  319 |       true, // skipHistory — hasSubmitted must be from the CURRENT round, not a stale snapshot
  320 |     );
  321 |   }
  322 | 
  323 |   // ── Action helpers ──────────────────────────────────────────────────────
  324 |   toggleReady(ready = true): void {
  325 |     this.send({ type: 'TOGGLE_READY', playerId: this.opts.user.id, ready });
  326 |   }
  327 | 
  328 |   startGame(): void {
  329 |     this.send({ type: 'START_GAME', playerId: this.opts.user.id });
  330 |   }
  331 | 
  332 |   submitGuess(roundIndex: number, year: number | null, lat: number | null, lng: number | null, hintsUsed: string[] = []): void {
  333 |     this.send({ type: 'SUBMIT_GUESS', playerId: this.opts.user.id, roundIndex, year, lat, lng, hintsUsed });
  334 |   }
  335 | 
  336 |   readyNext(roundIndex: number): void {
  337 |     this.send({ type: 'READY_NEXT', playerId: this.opts.user.id, roundIndex });
  338 |   }
  339 | 
  340 |   advanceRound(roundIndex: number, cause = 'PLAYER'): void {
  341 |     this.send({ type: 'ADVANCE_ROUND', playerId: this.opts.user.id, roundIndex, cause });
  342 |   }
  343 | 
  344 |   setTimer(roundTimerSec: number): void {
  345 |     this.send({ type: 'SET_TIMER', playerId: this.opts.user.id, roundTimerSec });
  346 |   }
  347 | 
  348 |   setResultsTimer(resultsAutoAdvanceSec: number): void {
  349 |     console.log(`[WS:${this.opts.user.displayName}] Sending SET_RESULTS_TIMER resultsAutoAdvanceSec=${resultsAutoAdvanceSec}`);
  350 |     this.send({ type: 'SET_RESULTS_TIMER', playerId: this.opts.user.id, resultsAutoAdvanceSec });
  351 |   }
  352 | 
  353 |   setYearRange(yearMin: number, yearMax: number): void {
  354 |     this.send({ type: 'SET_YEAR_RANGE', playerId: this.opts.user.id, yearMin, yearMax });
  355 |   }
  356 | 
  357 |   kickPlayer(targetPlayerId: string): void {
  358 |     this.send({ type: 'KICK_PLAYER', playerId: this.opts.user.id, targetPlayerId });
  359 |   }
  360 | 
  361 |   playAgain(newGameId: string): void {
  362 |     this.send({ type: 'PLAY_AGAIN', playerId: this.opts.user.id, newGameId });
  363 |   }
  364 | 
  365 |   /** Forcefully close the WebSocket (e.g. to simulate a network drop). */
  366 |   close(): void {
  367 |     this.manuallyClosed = true;
  368 |     this.clearHeartbeat();
  369 |     if (this.ws) {
  370 |       this.ws.close();
  371 |       this.ws = null;
  372 |     }
  373 |     this.connectPromise = null;
  374 |   }
  375 | 
  376 |   private clearHeartbeat(): void {
  377 |     if (this.heartbeat) {
  378 |       clearInterval(this.heartbeat);
  379 |       this.heartbeat = null;
  380 |     }
  381 |   }
  382 | }
  383 | 
```