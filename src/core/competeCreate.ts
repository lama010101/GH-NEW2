import { createCompeteSessionRequest } from "./competeApi";

export async function createAsyncCompeteSession(playerId: string, displayName: string): Promise<string> {
  const snapshot = await createCompeteSessionRequest({
    playerId,
    displayName,
    mode: "async",
    yearMin: -400,
    yearMax: 2025,
  });
  return snapshot.gameId;
}
