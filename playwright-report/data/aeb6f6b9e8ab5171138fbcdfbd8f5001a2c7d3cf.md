# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multiplayer-simulation.spec.ts >> Multiplayer Simulation >> resume-after-refresh: lobby, round-active, round-complete
- Location: scripts/test/playwright/specs/multiplayer-simulation.spec.ts:89:7

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: Timeout waiting for state match (15000ms)
```

# Test source

```ts
  147 |         console.log(`[WS:${this.opts.user.displayName}] Connected`);
  148 |         this.reconnectAttempts = 0;
  149 |         this.opts.onConnect?.();
  150 |         // Send JOIN_ROOM
  151 |         this.send({
  152 |           type: 'JOIN_ROOM',
  153 |           playerId: this.opts.user.id,
  154 |           displayName: this.opts.displayName ?? this.opts.user.displayName,
  155 |         });
  156 |         // Start heartbeat
  157 |         const hb = this.opts.heartbeatMs ?? 20000;
  158 |         this.heartbeat = setInterval(() => {
  159 |           if (this.ws?.readyState === WebSocket.OPEN) {
  160 |             this.ws.send(JSON.stringify({ type: 'PING' }));
  161 |           }
  162 |         }, hb);
  163 |       });
  164 | 
  165 |       ws.on('message', (raw: WebSocket.RawData) => {
  166 |         try {
  167 |           const msg = JSON.parse(raw.toString()) as ClientMessage;
  168 |           this.handleMessage(msg, resolveOnce);
  169 |         } catch (err) {
  170 |           console.error(`[WS:${this.opts.user.displayName}] Failed to parse message:`, err);
  171 |         }
  172 |       });
  173 | 
  174 |       ws.on('close', (code: number, reason: Buffer) => {
  175 |         this.clearHeartbeat();
  176 |         console.log(`[WS:${this.opts.user.displayName}] Closed code=${code} reason=${reason.toString()}`);
  177 |         this.opts.onDisconnect?.();
  178 |         if (!this.manuallyClosed) {
  179 |           this.attemptReconnect().catch((err) => {
  180 |             if (!firstStateResolved) {
  181 |               firstStateResolved = true;
  182 |               reject(err);
  183 |             }
  184 |           });
  185 |         }
  186 |       });
  187 | 
  188 |       ws.on('error', (err: Error) => {
  189 |         console.error(`[WS:${this.opts.user.displayName}] Error:`, err.message);
  190 |         if (!firstStateResolved) {
  191 |           firstStateResolved = true;
  192 |           reject(err);
  193 |         }
  194 |       });
  195 |     });
  196 |     return this.connectPromise;
  197 |   }
  198 | 
  199 |   private attemptReconnect(): Promise<void> {
  200 |     if (this.reconnectAttempts >= this.maxReconnectAttempts) {
  201 |       return Promise.reject(new Error(`Max reconnect attempts reached for ${this.opts.user.displayName}`));
  202 |     }
  203 |     this.reconnectAttempts++;
  204 |     const delay = this.reconnectDelayMs * this.reconnectAttempts;
  205 |     console.log(`[WS:${this.opts.user.displayName}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
  206 |     return new Promise((resolve) => setTimeout(resolve, delay)).then(() => {
  207 |       this.connectPromise = null;
  208 |       return this.connect();
  209 |     });
  210 |   }
  211 | 
  212 |   private handleMessage(msg: ClientMessage, resolveOnce: () => void): void {
  213 |     switch (msg.type) {
  214 |       case 'STATE_UPDATE':
  215 |         this.opts.onStateUpdate?.(msg.snapshot as CompeteSnapshot);
  216 |         resolveOnce();
  217 |         break;
  218 |       case 'ERROR':
  219 |         console.warn(`[WS:${this.opts.user.displayName}] ERROR: ${msg.message}`);
  220 |         this.opts.onError?.(msg.message);
  221 |         break;
  222 |       case 'PLAYER_SUBMITTED':
  223 |         this.opts.onPlayerSubmitted?.(msg.playerId, msg.playerName);
  224 |         break;
  225 |       case 'TIMER_CLAMPED':
  226 |         this.opts.onTimerClamped?.(msg.newPhaseEndsAt, msg.clampedToSec);
  227 |         break;
  228 |       case 'PLAY_AGAIN':
  229 |         this.opts.onPlayAgain?.(msg.newGameId);
  230 |         break;
  231 |     }
  232 |   }
  233 | 
  234 |   private send(msg: ServerMessage): void {
  235 |     if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
  236 |       console.warn(`[WS:${this.opts.user.displayName}] Cannot send — socket not open`);
  237 |       return;
  238 |     }
  239 |     this.ws.send(JSON.stringify(msg));
  240 |   }
  241 | 
  242 |   /** Wait for the next STATE_UPDATE matching a predicate. */
  243 |   waitForState(predicate: (s: CompeteSnapshot) => boolean, timeoutMs = 30000): Promise<CompeteSnapshot> {
  244 |     return new Promise((resolve, reject) => {
  245 |       const timer = setTimeout(() => {
  246 |         this.opts.onStateUpdate = originalHandler;
> 247 |         reject(new Error(`Timeout waiting for state match (${timeoutMs}ms)`));
      |                ^ Error: Timeout waiting for state match (15000ms)
  248 |       }, timeoutMs);
  249 | 
  250 |       const originalHandler = this.opts.onStateUpdate;
  251 |       this.opts.onStateUpdate = (snapshot: CompeteSnapshot) => {
  252 |         originalHandler?.(snapshot);
  253 |         if (predicate(snapshot)) {
  254 |           clearTimeout(timer);
  255 |           this.opts.onStateUpdate = originalHandler;
  256 |           resolve(snapshot);
  257 |         }
  258 |       };
  259 |     });
  260 |   }
  261 | 
  262 |   // ── Action helpers ──────────────────────────────────────────────────────
  263 |   toggleReady(ready = true): void {
  264 |     this.send({ type: 'TOGGLE_READY', playerId: this.opts.user.id, ready });
  265 |   }
  266 | 
  267 |   startGame(): void {
  268 |     this.send({ type: 'START_GAME', playerId: this.opts.user.id });
  269 |   }
  270 | 
  271 |   submitGuess(roundIndex: number, year: number | null, lat: number | null, lng: number | null, hintsUsed: string[] = []): void {
  272 |     this.send({ type: 'SUBMIT_GUESS', playerId: this.opts.user.id, roundIndex, year, lat, lng, hintsUsed });
  273 |   }
  274 | 
  275 |   readyNext(roundIndex: number): void {
  276 |     this.send({ type: 'READY_NEXT', playerId: this.opts.user.id, roundIndex });
  277 |   }
  278 | 
  279 |   advanceRound(roundIndex: number, cause = 'PLAYER'): void {
  280 |     this.send({ type: 'ADVANCE_ROUND', playerId: this.opts.user.id, roundIndex, cause });
  281 |   }
  282 | 
  283 |   setTimer(roundTimerSec: number): void {
  284 |     this.send({ type: 'SET_TIMER', playerId: this.opts.user.id, roundTimerSec });
  285 |   }
  286 | 
  287 |   setYearRange(yearMin: number, yearMax: number): void {
  288 |     this.send({ type: 'SET_YEAR_RANGE', playerId: this.opts.user.id, yearMin, yearMax });
  289 |   }
  290 | 
  291 |   kickPlayer(targetPlayerId: string): void {
  292 |     this.send({ type: 'KICK_PLAYER', playerId: this.opts.user.id, targetPlayerId });
  293 |   }
  294 | 
  295 |   playAgain(newGameId: string): void {
  296 |     this.send({ type: 'PLAY_AGAIN', playerId: this.opts.user.id, newGameId });
  297 |   }
  298 | 
  299 |   /** Forcefully close the WebSocket (e.g. to simulate a network drop). */
  300 |   close(): void {
  301 |     this.manuallyClosed = true;
  302 |     this.clearHeartbeat();
  303 |     if (this.ws) {
  304 |       this.ws.close();
  305 |       this.ws = null;
  306 |     }
  307 |     this.connectPromise = null;
  308 |   }
  309 | 
  310 |   private clearHeartbeat(): void {
  311 |     if (this.heartbeat) {
  312 |       clearInterval(this.heartbeat);
  313 |       this.heartbeat = null;
  314 |     }
  315 |   }
  316 | }
  317 | 
```