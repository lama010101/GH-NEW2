import { BrowserPool, PlayerBrowser } from './browserPool';
import { CompeteWSClient } from './websocketClient';
import { observeState, captureResumeToken, diffResumeTokens } from './observer';

export type EdgeCaseType =
  | 'late-join'
  | 'duplicate-ready'
  | 'kick-player'
  | '7th-player-join'
  | 'timeout'
  | 'partial-guess-year-only'
  | 'partial-guess-location-only'
  | 'hint-purchase'
  | 'duplicate-submit'
  | 'rapid-submits'
  | 'only-one-next'
  | 'ws-drop-reconnect'
  | 'mid-round-refresh'
  | 'mid-lobby-refresh'
  | 'mid-results-refresh';

export interface EdgeCase {
  type: EdgeCaseType;
  description: string;
  phase: 'lobby' | 'round-active' | 'round-complete' | 'between-games';
  inject: (
    pool: BrowserPool,
    clients: CompeteWSClient[],
    gameId: string,
    roundIndex: number,
  ) => Promise<void>;
}

/**
 * Edge cases to inject during the simulation.
 */
export const EDGE_CASES: EdgeCase[] = [
  {
    type: 'late-join',
    description: 'A player joins after the lobby is already populated',
    phase: 'lobby',
    inject: async (pool, clients, gameId) => {
      // This is already covered by the normal flow (all 6 join before ready)
      // Simulate by having one player toggle ready, then another join (not possible in current flow)
      console.log('[EDGE] Skipping late-join (already covered by normal flow)');
    },
  },
  {
    type: 'duplicate-ready',
    description: 'A player toggles ready multiple times',
    phase: 'lobby',
    inject: async (pool, clients) => {
      const client = clients[1];
      client.toggleReady(true);
      await new Promise((r) => setTimeout(r, 200));
      client.toggleReady(false);
      await new Promise((r) => setTimeout(r, 200));
      client.toggleReady(true);
      await new Promise((r) => setTimeout(r, 200));
      console.log('[EDGE] Duplicate ready toggles sent');
    },
  },
  {
    type: 'kick-player',
    description: 'Host kicks a non-host player',
    phase: 'lobby',
    inject: async (pool, clients) => {
      const hostClient = clients[0];
      const targetClient = clients[5];
      hostClient.kickPlayer(targetClient.user.id);
      console.log('[EDGE] Player kicked');
      // Re-add the player for the rest of the simulation
      await new Promise((r) => setTimeout(r, 1000));
    },
  },
  {
    type: '7th-player-join',
    description: 'Attempt to join with a 7th player (should fail)',
    phase: 'lobby',
    inject: async (pool, clients, gameId) => {
      // Create a temporary 7th context and try to join
      const tempContext = await pool.host().context.browser.newContext();
      const tempPage = await tempContext.newPage();
      await tempPage.goto(`${pool.baseURL}/compete/${gameId}`);
      await tempPage.waitForLoadState('networkidle').catch(() => undefined);
      // Should see an error or be unable to join
      await tempContext.close();
      console.log('[EDGE] 7th player join attempt completed');
    },
  },
  {
    type: 'timeout',
    description: 'A player does not submit before the timer expires',
    phase: 'round-active',
    inject: async (pool, clients, gameId, roundIndex) => {
      // One player simply does not submit
      console.log('[EDGE] Player will timeout (no submission)');
    },
  },
  {
    type: 'partial-guess-year-only',
    description: 'A player submits only a year (no location)',
    phase: 'round-active',
    inject: async (pool, clients, gameId, roundIndex) => {
      const client = clients[2];
      const year = 1950;
      client.submitGuess(roundIndex, year, null, null, []);
      console.log('[EDGE] Partial guess (year only) submitted');
    },
  },
  {
    type: 'partial-guess-location-only',
    description: 'A player submits only a location (no year)',
    phase: 'round-active',
    inject: async (pool, clients, gameId, roundIndex) => {
      const client = clients[3];
      const lat = 40.7128;
      const lng = -74.006;
      client.submitGuess(roundIndex, null, lat, lng, []);
      console.log('[EDGE] Partial guess (location only) submitted');
    },
  },
  {
    type: 'hint-purchase',
    description: 'A player purchases a hint (simulated via hintsUsed array)',
    phase: 'round-active',
    inject: async (pool, clients, gameId, roundIndex) => {
      const client = clients[1];
      const year = 1969;
      const lat = 0.67408;
      const lng = 23.47297;
      client.submitGuess(roundIndex, year, lat, lng, ['hint-1', 'hint-2']);
      console.log('[EDGE] Guess with hints submitted');
    },
  },
  {
    type: 'duplicate-submit',
    description: 'A player submits the same guess twice',
    phase: 'round-active',
    inject: async (pool, clients, gameId, roundIndex) => {
      const client = clients[4];
      const year = 2000;
      const lat = 0;
      const lng = 0;
      client.submitGuess(roundIndex, year, lat, lng, []);
      await new Promise((r) => setTimeout(r, 100));
      client.submitGuess(roundIndex, year, lat, lng, []);
      console.log('[EDGE] Duplicate submit sent');
    },
  },
  {
    type: 'rapid-submits',
    description: 'A player submits multiple guesses rapidly',
    phase: 'round-active',
    inject: async (pool, clients, gameId, roundIndex) => {
      const client = clients[5];
      for (let i = 0; i < 3; i++) {
        client.submitGuess(roundIndex, 1900 + i * 10, 0, 0, []);
        await new Promise((r) => setTimeout(r, 50));
      }
      console.log('[EDGE] Rapid submits sent');
    },
  },
  {
    type: 'only-one-next',
    description: 'Only one player clicks next round, wait for auto-advance',
    phase: 'round-complete',
    inject: async (pool, clients, gameId, roundIndex) => {
      const client = clients[0];
      client.readyNext(roundIndex);
      console.log('[EDGE] Only one player clicked next (waiting for auto-advance)');
      // Wait for auto-advance timer (default 10s)
      await new Promise((r) => setTimeout(r, 11000));
    },
  },
  {
    type: 'ws-drop-reconnect',
    description: 'Simulate a WebSocket drop and reconnect',
    phase: 'round-active',
    inject: async (pool, clients, gameId, roundIndex) => {
      const client = clients[1];
      client.close();
      console.log('[EDGE] WebSocket closed');
      await new Promise((r) => setTimeout(r, 2000));
      // Reconnect
      await client.connect();
      console.log('[EDGE] WebSocket reconnected');
    },
  },
  {
    type: 'mid-round-refresh',
    description: 'A player refreshes the page mid-round',
    phase: 'round-active',
    inject: async (pool, clients, gameId, roundIndex) => {
      const player = pool.byIndex(1);
      const before = await captureResumeToken(player.page);
      await pool.refresh(player);
      const after = await captureResumeToken(player.page);
      const diffs = diffResumeTokens(before, after, 'mid-round-refresh');
      if (diffs.length > 0) {
        console.warn('[EDGE] Resume-after-refresh diffs:', diffs);
      } else {
        console.log('[EDGE] Resume-after-refresh successful (no diffs)');
      }
    },
  },
  {
    type: 'mid-lobby-refresh',
    description: 'A player refreshes the page in lobby',
    phase: 'lobby',
    inject: async (pool, clients, gameId) => {
      const player = pool.byIndex(2);
      const before = await captureResumeToken(player.page);
      await pool.refresh(player);
      const after = await captureResumeToken(player.page);
      const diffs = diffResumeTokens(before, after, 'mid-lobby-refresh');
      if (diffs.length > 0) {
        console.warn('[EDGE] Resume-after-refresh diffs:', diffs);
      } else {
        console.log('[EDGE] Resume-after-refresh successful (no diffs)');
      }
    },
  },
  {
    type: 'mid-results-refresh',
    description: 'A player refreshes the page during round results',
    phase: 'round-complete',
    inject: async (pool, clients, gameId, roundIndex) => {
      const player = pool.byIndex(3);
      const before = await captureResumeToken(player.page);
      await pool.refresh(player);
      const after = await captureResumeToken(player.page);
      const diffs = diffResumeTokens(before, after, 'mid-results-refresh');
      if (diffs.length > 0) {
        console.warn('[EDGE] Resume-after-refresh diffs:', diffs);
      } else {
        console.log('[EDGE] Resume-after-refresh successful (no diffs)');
      }
    },
  },
];

/**
 * Inject edge cases at appropriate phases of the game.
 */
export class EdgeCaseEngine {
  private injected: Set<EdgeCaseType> = new Set();

  /**
   * Inject edge cases for a specific phase.
   */
  async injectForPhase(
    phase: 'lobby' | 'round-active' | 'round-complete' | 'between-games',
    pool: BrowserPool,
    clients: CompeteWSClient[],
    gameId: string,
    roundIndex: number,
  ): Promise<void> {
    const applicable = EDGE_CASES.filter((ec) => ec.phase === phase && !this.injected.has(ec.type));
    console.log(`[EDGE] Injecting ${applicable.length} edge cases for phase ${phase}`);

    for (const ec of applicable) {
      console.log(`[EDGE] Injecting: ${ec.type} - ${ec.description}`);
      try {
        await ec.inject(pool, clients, gameId, roundIndex);
        this.injected.add(ec.type);
      } catch (err) {
        console.error(`[EDGE] Failed to inject ${ec.type}:`, err);
      }
    }
  }

  get injectedCount(): number {
    return this.injected.size;
  }

  get totalCount(): number {
    return EDGE_CASES.length;
  }
}
