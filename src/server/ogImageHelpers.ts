import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getGameState, deriveStateFromEventStream } from "@/server/getGameState";
import { eventTypeToSessionStatus } from "@/server/sessionCore";
import type { PlayerState, ReconstructedGameState } from "@/server/getGameState";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidGameId(gameId: string): boolean {
  return UUID_REGEX.test(gameId);
}

export async function fetchAvatarAsDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GuessHistoryOGBot/1.0)" },
      cache: "force-cache",
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type");
    if (contentType !== "image/png" && contentType !== "image/jpeg") return null;
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

export async function getSessionStatusAndPlayers(
  gameId: string
): Promise<{ status: string; players: PlayerState[]; gameState: ReconstructedGameState } | null> {
  try {
    const gameState = await getGameState(gameId);
    const { currentPhase } = deriveStateFromEventStream(gameState.events);
    const status = eventTypeToSessionStatus(currentPhase);
    return { status, players: gameState.players, gameState };
  } catch {
    return null;
  }
}

export function fallbackResponse(): Response {
  const filePath = join(process.cwd(), "public", "og-image.png");
  const fileBuffer = readFileSync(filePath);
  return new Response(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
