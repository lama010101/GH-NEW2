# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multiplayer-simulation.spec.ts >> Multiplayer Simulation >> 6 players, 3 games, 5 rounds each, full edge-case suite
- Location: scripts/test/playwright/specs/multiplayer-simulation.spec.ts:16:7

# Error details

```
Error: Timeout waiting for state match (120000ms)
```

# Test source

```ts
  167 |         // Start heartbeat
  168 |         const hb = this.opts.heartbeatMs ?? 20000;
  169 |         this.heartbeat = setInterval(() => {
  170 |           if (this.ws?.readyState === WebSocket.OPEN) {
  171 |             this.ws.send(JSON.stringify({ type: 'PING' }));
  172 |           }
  173 |         }, hb);
  174 |       });
  175 | 
  176 |       ws.on('message', (raw: WebSocket.RawData) => {
  177 |         try {
  178 |           const msg = JSON.parse(raw.toString()) as ClientMessage;
  179 |           this.handleMessage(msg, resolveOnce);
  180 |         } catch (err) {
  181 |           console.error(`[WS:${this.opts.user.displayName}] Failed to parse message:`, err);
  182 |         }
  183 |       });
  184 | 
  185 |       ws.on('close', (code: number, reason: Buffer) => {
  186 |         this.clearHeartbeat();
  187 |         console.log(`[WS:${this.opts.user.displayName}] Closed code=${code} reason=${reason.toString()}`);
  188 |         this.opts.onDisconnect?.();
  189 |         if (!this.manuallyClosed) {
  190 |           this.attemptReconnect().catch((err) => {
  191 |             if (!firstStateResolved) {
  192 |               firstStateResolved = true;
  193 |               reject(err);
  194 |             }
  195 |           });
  196 |         }
  197 |       });
  198 | 
  199 |       ws.on('error', (err: Error) => {
  200 |         console.error(`[WS:${this.opts.user.displayName}] Error:`, err.message);
  201 |         if (!firstStateResolved) {
  202 |           firstStateResolved = true;
  203 |           reject(err);
  204 |         }
  205 |       });
  206 |     });
  207 |     return this.connectPromise;
  208 |   }
  209 | 
  210 |   private attemptReconnect(): Promise<void> {
  211 |     if (this.reconnectAttempts >= this.maxReconnectAttempts) {
  212 |       return Promise.reject(new Error(`Max reconnect attempts reached for ${this.opts.user.displayName}`));
  213 |     }
  214 |     this.reconnectAttempts++;
  215 |     const delay = this.reconnectDelayMs * this.reconnectAttempts;
  216 |     console.log(`[WS:${this.opts.user.displayName}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
  217 |     return new Promise((resolve) => setTimeout(resolve, delay)).then(() => {
  218 |       this.connectPromise = null;
  219 |       return this.connect();
  220 |     });
  221 |   }
  222 | 
  223 |   private handleMessage(msg: ClientMessage, resolveOnce: () => void): void {
  224 |     switch (msg.type) {
  225 |       case 'STATE_UPDATE':
  226 |         this.lastSnapshot = msg.snapshot as CompeteSnapshot;
  227 |         this.opts.onStateUpdate?.(this.lastSnapshot);
  228 |         resolveOnce();
  229 |         break;
  230 |       case 'ERROR':
  231 |         console.warn(`[WS:${this.opts.user.displayName}] ERROR: ${msg.message}`);
  232 |         this.opts.onError?.(msg.message);
  233 |         break;
  234 |       case 'PLAYER_SUBMITTED':
  235 |         this.opts.onPlayerSubmitted?.(msg.playerId, msg.playerName);
  236 |         break;
  237 |       case 'TIMER_CLAMPED':
  238 |         this.opts.onTimerClamped?.(msg.newPhaseEndsAt, msg.clampedToSec);
  239 |         break;
  240 |       case 'PLAY_AGAIN':
  241 |         this.opts.onPlayAgain?.(msg.newGameId);
  242 |         break;
  243 |     }
  244 |   }
  245 | 
  246 |   private send(msg: ServerMessage): void {
  247 |     if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
  248 |       console.warn(`[WS:${this.opts.user.displayName}] Cannot send — socket not open`);
  249 |       return;
  250 |     }
  251 |     this.ws.send(JSON.stringify(msg));
  252 |   }
  253 | 
  254 |   /** Wait for the next STATE_UPDATE matching a predicate. */
  255 |   waitForState(predicate: (s: CompeteSnapshot) => boolean, timeoutMs = 30000): Promise<CompeteSnapshot> {
  256 |     // Check the current state first — if it already matches, resolve immediately.
  257 |     // This prevents a race where the state was received before waitForState was
  258 |     // called (e.g., ROUND_COMPLETE arrives during the submission loop, but the
  259 |     // orchestrator calls waitForState(ROUND_COMPLETE) afterwards).
  260 |     if (this.lastSnapshot && predicate(this.lastSnapshot)) {
  261 |       return Promise.resolve(this.lastSnapshot);
  262 |     }
  263 | 
  264 |     return new Promise((resolve, reject) => {
  265 |       const timer = setTimeout(() => {
  266 |         this.opts.onStateUpdate = originalHandler;
> 267 |         reject(new Error(`Timeout waiting for state match (${timeoutMs}ms)`));
      |                ^ Error: Timeout waiting for state match (120000ms)
  268 |       }, timeoutMs);
  269 | 
  270 |       const originalHandler = this.opts.onStateUpdate;
  271 |       this.opts.onStateUpdate = (snapshot: CompeteSnapshot) => {
  272 |         originalHandler?.(snapshot);
  273 |         if (predicate(snapshot)) {
  274 |           clearTimeout(timer);
  275 |           this.opts.onStateUpdate = originalHandler;
  276 |           resolve(snapshot);
  277 |         }
  278 |       };
  279 |     });
  280 |   }
  281 | 
  282 |   /**
  283 |    * Wait for a STATE_UPDATE confirming this player's guess was acknowledged
  284 |    * (hasSubmitted === true). Used by the orchestrator to detect rejected
  285 |    * guesses instead of fire-and-forget. (H17 fix — part 1)
  286 |    */
  287 |   waitForSubmissionAck(timeoutMs = 10000): Promise<CompeteSnapshot> {
  288 |     return this.waitForState(
  289 |       (s) => {
  290 |         const me = s.players.find((p) => p.playerId === this.opts.user.id);
  291 |         return me?.hasSubmitted === true;
  292 |       },
  293 |       timeoutMs,
  294 |     );
  295 |   }
  296 | 
  297 |   // ── Action helpers ──────────────────────────────────────────────────────
  298 |   toggleReady(ready = true): void {
  299 |     this.send({ type: 'TOGGLE_READY', playerId: this.opts.user.id, ready });
  300 |   }
  301 | 
  302 |   startGame(): void {
  303 |     this.send({ type: 'START_GAME', playerId: this.opts.user.id });
  304 |   }
  305 | 
  306 |   submitGuess(roundIndex: number, year: number | null, lat: number | null, lng: number | null, hintsUsed: string[] = []): void {
  307 |     this.send({ type: 'SUBMIT_GUESS', playerId: this.opts.user.id, roundIndex, year, lat, lng, hintsUsed });
  308 |   }
  309 | 
  310 |   readyNext(roundIndex: number): void {
  311 |     this.send({ type: 'READY_NEXT', playerId: this.opts.user.id, roundIndex });
  312 |   }
  313 | 
  314 |   advanceRound(roundIndex: number, cause = 'PLAYER'): void {
  315 |     this.send({ type: 'ADVANCE_ROUND', playerId: this.opts.user.id, roundIndex, cause });
  316 |   }
  317 | 
  318 |   setTimer(roundTimerSec: number): void {
  319 |     this.send({ type: 'SET_TIMER', playerId: this.opts.user.id, roundTimerSec });
  320 |   }
  321 | 
  322 |   setYearRange(yearMin: number, yearMax: number): void {
  323 |     this.send({ type: 'SET_YEAR_RANGE', playerId: this.opts.user.id, yearMin, yearMax });
  324 |   }
  325 | 
  326 |   kickPlayer(targetPlayerId: string): void {
  327 |     this.send({ type: 'KICK_PLAYER', playerId: this.opts.user.id, targetPlayerId });
  328 |   }
  329 | 
  330 |   playAgain(newGameId: string): void {
  331 |     this.send({ type: 'PLAY_AGAIN', playerId: this.opts.user.id, newGameId });
  332 |   }
  333 | 
  334 |   /** Forcefully close the WebSocket (e.g. to simulate a network drop). */
  335 |   close(): void {
  336 |     this.manuallyClosed = true;
  337 |     this.clearHeartbeat();
  338 |     if (this.ws) {
  339 |       this.ws.close();
  340 |       this.ws = null;
  341 |     }
  342 |     this.connectPromise = null;
  343 |   }
  344 | 
  345 |   private clearHeartbeat(): void {
  346 |     if (this.heartbeat) {
  347 |       clearInterval(this.heartbeat);
  348 |       this.heartbeat = null;
  349 |     }
  350 |   }
  351 | }
  352 | 
```