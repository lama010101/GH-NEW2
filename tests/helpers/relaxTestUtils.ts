import type { RelaxRoom } from './relaxRoom';
import type { RoundAnswer } from './dbGroundTruth';

const DEFAULT_ACTION_DELAY = 1200;
const DEFAULT_RETRY_INTERVAL = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function startPlayer(
  room: RelaxRoom,
  playerIndex: number,
  timeout = 30000,
): Promise<void> {
  const c = room.clients[playerIndex];
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const snap = c.getLastSnapshot();
    if (snap?.status === 'ROUND_ACTIVE' && snap.currentRoundIndex === 0) {
      return;
    }
    if (!snap || snap.status === 'LOBBY') {
      c.startGame();
    }
    try {
      await c.waitForState(
        (s) => s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === 0,
        DEFAULT_RETRY_INTERVAL,
      );
      return;
    } catch {
      // retry
    }
  }
  throw new Error(`Player ${playerIndex} did not start round 0 within ${timeout}ms`);
}

export async function startAllPlayers(room: RelaxRoom, timeout = 30000): Promise<void> {
  for (let i = 0; i < room.clients.length; i++) {
    await startPlayer(room, i, timeout);
    await sleep(DEFAULT_ACTION_DELAY);
  }
}

async function advancePlayerToRound(
  room: RelaxRoom,
  playerIndex: number,
  targetRound: number,
  timeout = 30000,
): Promise<void> {
  const c = room.clients[playerIndex];
  const currentRound = targetRound - 1;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const snap = c.getLastSnapshot();
    if (
      snap?.status === 'ROUND_ACTIVE' &&
      snap.currentRoundIndex === targetRound
    ) {
      return;
    }
    if (
      snap?.status === 'ROUND_COMPLETE' &&
      snap.currentRoundIndex === currentRound
    ) {
      c.readyNext(currentRound);
    }
    try {
      await c.waitForState(
        (s) =>
          (s.status === 'ROUND_ACTIVE' && s.currentRoundIndex === targetRound) ||
          s.status === 'SESSION_COMPLETE',
        DEFAULT_RETRY_INTERVAL,
      );
      return;
    } catch {
      // retry
    }
  }
  throw new Error(
    `Player ${playerIndex} did not advance to round ${targetRound} within ${timeout}ms`,
  );
}

export async function advanceAllToRound(
  room: RelaxRoom,
  targetRound: number,
  timeout = 30000,
): Promise<void> {
  for (let i = 0; i < room.clients.length; i++) {
    await advancePlayerToRound(room, i, targetRound, timeout);
    await sleep(DEFAULT_ACTION_DELAY);
  }
}

export interface GuessInput {
  year: number;
  lat: number | null;
  lng: number | null;
}

export type GuessFactory = (playerIndex: number, answer: RoundAnswer) => GuessInput;

export const exactGuess: GuessFactory = (_playerIndex, answer) => ({
  year: answer.year,
  lat: answer.latitude,
  lng: answer.longitude,
});

export async function playRound(
  room: RelaxRoom,
  answers: RoundAnswer[],
  roundIndex: number,
  guessFactory: GuessFactory = exactGuess,
  timeout = 30000,
): Promise<void> {
  const answer = answers[roundIndex];
  if (!answer) throw new Error(`No answer for round ${roundIndex}`);

  for (let i = 0; i < room.clients.length; i++) {
    const c = room.clients[i];
    const guess = guessFactory(i, answer);
    c.submitGuess(roundIndex, guess.year, guess.lat, guess.lng);
    await c.waitForSubmissionAck(timeout);
  }

  const isFinal = roundIndex === answers.length - 1;
  await Promise.all(
    room.clients.map((c) =>
      c.waitForState(
        (s) =>
          (isFinal
            ? s.status === 'SESSION_COMPLETE'
            : s.status === 'ROUND_COMPLETE') &&
          s.currentRoundIndex === roundIndex,
        timeout,
      ),
    ),
  );
}

export async function playThroughSession(
  room: RelaxRoom,
  answers: RoundAnswer[],
  guessFactory: GuessFactory = exactGuess,
): Promise<void> {
  await startAllPlayers(room);
  for (let roundIndex = 0; roundIndex < answers.length; roundIndex++) {
    await playRound(room, answers, roundIndex, guessFactory);
    if (roundIndex < answers.length - 1) {
      await advanceAllToRound(room, roundIndex + 1);
    }
  }
  await Promise.all(
    room.clients.map((c) =>
      c.waitForState((s) => s.status === 'SESSION_COMPLETE', 30000),
    ),
  );
}
