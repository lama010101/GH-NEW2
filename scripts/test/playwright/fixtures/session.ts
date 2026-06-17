import { Page } from '@playwright/test';
import { TEST_USERS, TestUser } from './auth';

export interface GameSession {
  gameId: string;
  roomCode: string;
  pages: Page[];
  host: TestUser;
  players: TestUser[];
}

/**
 * Create a compete session with 5 players
 */
export async function create5PlayerSession(
  browser: any,
  baseURL: string
): Promise<GameSession> {
  const host = TEST_USERS[0];
  const players = TEST_USERS.slice(1);

  // Create browser contexts for all 5 players
  const contexts = await Promise.all(
    TEST_USERS.map(() => browser.newContext())
  );

  const pages = await Promise.all(
    contexts.map(ctx => ctx.newPage())
  );

  // Sign in all 5 players using API
  for (let i = 0; i < TEST_USERS.length; i++) {
    const user = TEST_USERS[i];
    const page = pages[i];

    // Navigate to home page
    await page.goto(baseURL);

    // Skip sign-in for now - tests may not require full auth
    // Reload to ensure page is loaded
    await page.reload();
    await page.waitForLoadState('networkidle');
  }

  // Host creates session
  const hostPage = pages[0];

  // Navigate to compete page and create session
  await hostPage.goto(`${baseURL}/compete`);
  await hostPage.waitForLoadState('networkidle');

  // Create session via API
  const createResponse = await hostPage.request.post(`${baseURL}/api/compete/create`, {
    data: {
      displayName: host.displayName,
      playerId: host.id,
      mode: 'compete',
      totalRounds: 3,
    },
  });

  if (!createResponse.ok()) {
    const error = await createResponse.text();
    throw new Error(`Failed to create session: ${error}`);
  }

  const sessionData = await createResponse.json();
  const gameId = sessionData.gameId || sessionData.id;
  const roomCode = sessionData.roomCode || sessionData.room_code;

  if (!gameId) {
    throw new Error('No gameId returned from create session');
  }

  console.log(`[SESSION] Created game ${gameId} with room code ${roomCode}`);

  // Navigate all players to the game
  for (const page of pages) {
    await page.goto(`${baseURL}/compete/${gameId}`);
    await page.waitForLoadState('networkidle');
  }

  // Players 2-5 join the session
  for (let i = 1; i < players.length + 1; i++) {
    const player = TEST_USERS[i];
    const playerPage = pages[i];

    // Wait for the page to load and join button to be available
    await playerPage.waitForTimeout(500);

    // Click join button or wait for auto-join via URL
    const joinButton = playerPage.locator('button:has-text("Join")');
    if (await joinButton.isVisible().catch(() => false)) {
      await joinButton.click();
      await playerPage.waitForTimeout(500);
    }
  }

  // Wait for all players to appear in the lobby
  await hostPage.waitForTimeout(1000);

  // All players toggle ready
  for (let i = 0; i < TEST_USERS.length; i++) {
    const page = pages[i];

    // Find and click the ready button
    const readyButton = page.locator('button:has-text("Ready"), button:has-text("I\'m Ready")');
    if (await readyButton.isVisible().catch(() => false)) {
      await readyButton.click();
      await page.waitForTimeout(200);
    }
  }

  // Host starts the game
  const startButton = hostPage.locator('button:has-text("Start Game"), button:has-text("Start")');
  if (await startButton.isVisible().catch(() => false)) {
    await startButton.click();
  } else {
    // Try API call to start
    const startResponse = await hostPage.request.post(`${baseURL}/api/compete/${gameId}/start`, {
      headers: {
        'x-partykit-secret': process.env.PARTYKIT_SECRET || '',
      },
      data: {
        playerId: host.id,
      },
    });

    if (!startResponse.ok()) {
      console.warn(`[SESSION] Start API call failed: ${await startResponse.text()}`);
    }
  }

  // Wait for game to start (ROUND_ACTIVE status)
  await hostPage.waitForTimeout(2000);

  return {
    gameId,
    roomCode: roomCode || '',
    pages,
    host,
    players,
  };
}

/**
 * Create a simple 1-player session for single-player tests
 */
export async function createSinglePlayerSession(
  page: Page,
  baseURL: string,
  userIndex: number = 0
): Promise<{ gameId: string; roomCode: string }> {
  const user = TEST_USERS[userIndex];

  // Create session via API
  const createResponse = await page.request.post(`${baseURL}/api/compete/create`, {
    data: {
      displayName: user.displayName,
      playerId: user.id,
      mode: 'compete',
      totalRounds: 3,
    },
  });

  if (!createResponse.ok()) {
    const error = await createResponse.text();
    throw new Error(`Failed to create session: ${error}`);
  }

  const sessionData = await createResponse.json();
  const gameId = sessionData.gameId || sessionData.id;
  const roomCode = sessionData.roomCode || sessionData.room_code;

  // Navigate to the game
  await page.goto(`${baseURL}/compete/${gameId}`);
  await page.waitForLoadState('networkidle');

  return { gameId, roomCode: roomCode || '' };
}

/**
 * Clean up a game session
 */
export async function cleanupSession(pages: Page[], gameId: string, baseURL: string): Promise<void> {
  // Navigate all pages to home to leave the session
  for (const page of pages) {
    try {
      await page.goto(baseURL);
      await page.waitForTimeout(300);
    } catch {
      // Ignore errors during cleanup
    }
  }

  // Close all contexts
  for (const page of pages) {
    try {
      await page.context().close();
    } catch {
      // Ignore errors during cleanup
    }
  }
}
