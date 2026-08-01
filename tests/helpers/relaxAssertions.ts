import { Page, expect } from '@playwright/test';
import type { CompeteSnapshot } from '../../scripts/test/playwright/orchestrator/websocketClient';
import type { RelaxSnapshot } from './relaxRoom';

type DbVersion = {
  roundEventVersion: number;
  playerEventVersions: Record<string, number>;
};

export const BANNED_TEXT = ['waiting for others', 'starting soon', 'players ready'];

export async function assertNoBannedText(page: Page, label: string): Promise<void> {
  const text = (await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')).toLowerCase();
  for (const banned of BANNED_TEXT) {
    expect(text, `[${label}] Banned text found: "${banned}"`).not.toContain(banned);
  }
}

function isAtLeastAsNewForPlayer(
  playerId: string,
  incoming: DbVersion | undefined,
  last: DbVersion | undefined,
): boolean {
  if (!incoming || !last) return true;
  if (incoming.roundEventVersion < last.roundEventVersion) return false;
  const incomingVersion = incoming.playerEventVersions[playerId] ?? 0;
  const lastVersion = last.playerEventVersions[playerId] ?? 0;
  return incomingVersion >= lastVersion;
}

export interface SnapshotObserver {
  history: RelaxSnapshot[];
  onStateUpdate: (snapshot: CompeteSnapshot) => void;
}

export function createSnapshotObserver(
  playerId: string,
  label: string,
  violations: string[],
): SnapshotObserver {
  const history: RelaxSnapshot[] = [];
  let hasSeenOwnViewer = false;
  const everSubmittedRound = new Map<number, boolean>();
  const everCompletedRound = new Map<number, boolean>();

  return {
    history,
    onStateUpdate(snapshot: CompeteSnapshot) {
      const snap = snapshot as RelaxSnapshot;
      history.push(snap);
      const round = snapshot.currentRoundIndex;
      const me = snapshot.players.find((p) => p.playerId === playerId);
      const hasSubmitted = me?.hasSubmitted ?? false;

      if (snapshot.viewerPlayerId === playerId) {
        hasSeenOwnViewer = true;
      }
      if (snapshot.viewerPlayerId !== null && snapshot.viewerPlayerId !== playerId) {
        violations.push(
          `${label} received snapshot intended for wrong viewer: ${snapshot.viewerPlayerId} (expected ${playerId})`,
        );
      } else if (hasSeenOwnViewer && snapshot.viewerPlayerId === null) {
        violations.push(
          `${label} received base snapshot with null viewer after already seeing its own view`,
        );
      }

      if (history.length >= 2) {
        const prev = history[history.length - 2];
        if (snapshot.currentRoundIndex < prev.currentRoundIndex) {
          violations.push(
            `${label} currentRoundIndex regressed: ${prev.currentRoundIndex} -> ${snapshot.currentRoundIndex} (snapshot #${history.length})`,
          );
        }
        if (
          typeof prev.snapshotVersion === 'number' &&
          typeof snapshot.snapshotVersion === 'number' &&
          snapshot.snapshotVersion < prev.snapshotVersion
        ) {
          violations.push(
            `${label} snapshotVersion regressed: ${prev.snapshotVersion} -> ${snapshot.snapshotVersion} (snapshot #${history.length})`,
          );
        }
        if (prev.dbVersion && snapshot.dbVersion) {
          if (!isAtLeastAsNewForPlayer(playerId, snapshot.dbVersion, prev.dbVersion)) {
            violations.push(
              `${label} dbVersion regressed at snapshot #${history.length} (round=${round})`,
            );
          }
        }
      }

      if (everCompletedRound.get(round) && snapshot.status === 'ROUND_ACTIVE') {
        violations.push(
          `${label} status regressed from ROUND_COMPLETE to ROUND_ACTIVE for round ${round} (snapshot #${history.length})`,
        );
      }
      if (everSubmittedRound.get(round) && !hasSubmitted) {
        violations.push(
          `${label} hasSubmitted regressed to false for round ${round} (snapshot #${history.length})`,
        );
      }

      if (snapshot.status === 'ROUND_COMPLETE') {
        everCompletedRound.set(round, true);
      }
      if (hasSubmitted) {
        everSubmittedRound.set(round, true);
      }
    },
  };
}

export async function assertNextRoundEnabled(page: Page, label: string): Promise<void> {
  const nextButton = page.locator('[data-testid="round-next-btn"]').first();
  await expect(nextButton, `${label}: Next Round button should be enabled`).toBeEnabled({
    timeout: 10000,
  });
}

export async function assertLeaderboardVisible(page: Page, label: string): Promise<void> {
  await expect(
    page.locator('[data-testid="round-complete-section"]'),
    `${label}: round complete section should be visible`,
  ).toBeVisible({ timeout: 10000 });
  const leaderboard = page.locator('text=/round leaderboard|leaderboard/i').first();
  await expect(leaderboard, `${label}: leaderboard title should be visible`).toBeVisible({
    timeout: 10000,
  });
}
