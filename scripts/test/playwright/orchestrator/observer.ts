import { Page } from '@playwright/test';
import type { CompeteSnapshot, SnapshotStatus } from './websocketClient';

export interface ObservedState {
  status: SnapshotStatus | 'UNKNOWN';
  currentRoundIndex: number | null;
  readyForNext: string[];
  playerCount: number;
  readyCount: number;
  hasSubmitted: boolean;
  testid: string | null;
}

/**
 * Read the current game state from a browser by inspecting DOM testids.
 *
 * The browser is an observer — actions are driven via WebSocket. This module
 * verifies that the browser-visible state matches the WebSocket snapshot.
 */
export async function observeState(page: Page): Promise<ObservedState> {
  const section = await page
    .locator('[data-testid="lobby-shell"], [data-testid="round-active-section"], [data-testid="round-complete-section"], [data-testid="session-complete-section"]')
    .first();

  const present = await section.isVisible().catch(() => false);
  if (!present) {
    return {
      status: 'UNKNOWN',
      currentRoundIndex: null,
      readyForNext: [],
      playerCount: 0,
      readyCount: 0,
      hasSubmitted: false,
      testid: null,
    };
  }

  const testid = await section.getAttribute('data-testid', { timeout: 5000 }).catch(() => null);
  const statusAttr = await section.getAttribute('data-status', { timeout: 5000 }).catch(() => null);
  const roundAttr = await section.getAttribute('data-round-index', { timeout: 5000 }).catch(() => null);

  let status: SnapshotStatus | 'UNKNOWN' = 'UNKNOWN';
  if (testid === 'lobby-shell') status = 'LOBBY';
  else if (testid === 'round-active-section') status = statusAttr as SnapshotStatus ?? 'ROUND_ACTIVE';
  else if (testid === 'round-complete-section') status = statusAttr as SnapshotStatus ?? 'ROUND_COMPLETE';
  else if (testid === 'session-complete-section') status = statusAttr as SnapshotStatus ?? 'SESSION_COMPLETE';

  // Count ready players in lobby
  let readyCount = 0;
  let playerCount = 0;
  if (status === 'LOBBY') {
    const roster = page.locator('[data-testid="lobby-player-"]');
    const players = await page.locator('[data-testid^="lobby-player-"]').count();
    playerCount = players;
    for (let i = 0; i < players; i++) {
      const el = page.locator('[data-testid^="lobby-player-"]').nth(i);
      const ready = await el.getAttribute('data-ready');
      if (ready === 'true') readyCount++;
    }
  }

  // Check ready-for-next in round-complete
  let readyForNext: string[] = [];
  if (status === 'ROUND_COMPLETE') {
    const nextBtn = page.locator('[data-testid="round-next-btn"]').first();
    const present = await nextBtn.isVisible().catch(() => false);
    if (present) {
      // We can't easily read the readyForNext array from DOM; just check the
      // disabled state of the local viewer's next button.
      const disabled = await nextBtn.isDisabled().catch(() => false);
      const ready = disabled ? 'viewer' : '';
      readyForNext = ready ? [ready] : [];
    }
  }

  // hasSubmitted: in round-active, check if submit button is in submitted state
  let hasSubmitted = false;
  if (status === 'ROUND_ACTIVE') {
    const submitBtn = page.locator('[data-testid="round-submit-btn"]').first();
    const cls = await submitBtn.getAttribute('class').catch(() => '');
    hasSubmitted = !!cls && cls.includes('submitBtnSubmitted');
  }

  return {
    status,
    currentRoundIndex: roundAttr ? Number(roundAttr) : null,
    readyForNext,
    playerCount,
    readyCount,
    hasSubmitted,
    testid,
  };
}

/**
 * Assert that a browser's observed state matches the WebSocket snapshot.
 */
export function assertStateMatches(
  observed: ObservedState,
  snapshot: CompeteSnapshot,
  label: string,
): string[] {
  const failures: string[] = [];

  if (observed.status !== snapshot.status) {
    failures.push(
      `[${label}] status mismatch: browser=${observed.status} ws=${snapshot.status}`,
    );
  }

  if (
    observed.currentRoundIndex !== null &&
    observed.currentRoundIndex !== snapshot.currentRoundIndex
  ) {
    failures.push(
      `[${label}] round mismatch: browser=${observed.currentRoundIndex} ws=${snapshot.currentRoundIndex}`,
    );
  }

  if (observed.status === 'LOBBY' && snapshot.status === 'LOBBY') {
    if (observed.playerCount !== snapshot.players.length) {
      failures.push(
        `[${label}] player count mismatch: browser=${observed.playerCount} ws=${snapshot.players.length}`,
      );
    }
    const wsReady = snapshot.players.filter((p) => p.ready).length;
    if (observed.readyCount !== wsReady) {
      failures.push(
        `[${label}] ready count mismatch: browser=${observed.readyCount} ws=${wsReady}`,
      );
    }
  }

  return failures;
}

/**
 * Capture a snapshot of the page state for resume-after-refresh assertions.
 *
 * Returns a serializable object that can be compared before/after a refresh.
 */
export async function captureResumeToken(page: Page): Promise<{
  url: string;
  status: string;
  roundIndex: string | null;
  testid: string | null;
  bodyTextSample: string;
}> {
  const section = page
    .locator('[data-testid="lobby-shell"], [data-testid="round-active-section"], [data-testid="round-complete-section"], [data-testid="session-complete-section"]')
    .first();

  const testid = await section.getAttribute('data-testid', { timeout: 5000 }).catch(() => null);
  const status = await section.getAttribute('data-status', { timeout: 5000 }).catch(() => '') ?? '';
  const roundIndex = await section.getAttribute('data-round-index', { timeout: 5000 }).catch(() => null);

  // Sample the first 200 chars of body text — enough to detect phase changes
  const bodyTextSample = await Promise.race([
    page.evaluate(() => {
      return (document.body.innerText || '').slice(0, 200);
    }),
    new Promise<string>((resolve) => setTimeout(() => resolve(''), 5000)),
  ]);

  return {
    url: page.url(),
    status: status || testid || 'UNKNOWN',
    roundIndex,
    testid,
    bodyTextSample,
  };
}

/**
 * Compare two resume tokens and return a list of differences.
 *
 * The URL is allowed to differ if the user navigated away and back. The
 * status, round index, and testid should match.
 */
export function diffResumeTokens(
  before: Awaited<ReturnType<typeof captureResumeToken>>,
  after: Awaited<ReturnType<typeof captureResumeToken>>,
  label: string,
): string[] {
  const diffs: string[] = [];

  if (before.testid !== after.testid) {
    diffs.push(`[${label}] testid changed: ${before.testid} → ${after.testid}`);
  }
  if (before.status !== after.status) {
    diffs.push(`[${label}] status changed: ${before.status} → ${after.status}`);
  }
  if (before.roundIndex !== after.roundIndex) {
    diffs.push(`[${label}] roundIndex changed: ${before.roundIndex} → ${after.roundIndex}`);
  }

  return diffs;
}
