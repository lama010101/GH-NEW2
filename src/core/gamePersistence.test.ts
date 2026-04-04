import { describe, expect, it, vi } from "vitest";
import { createInitialGameState, gameReducer } from "./gameEngine";
import { bootGameState, buildGamePath, loadGameState, saveGameState } from "./gamePersistence";
import { PRACTICE_EVENTS } from "./mockEvents";

function createJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

const REAL_EVENTS = PRACTICE_EVENTS.map((event, index) => ({
  ...event,
  imageUrl: `https://example.com/event-${index + 1}.jpg`,
  thumbUrl: `https://example.com/event-${index + 1}-thumb.jpg`
}));

describe("game persistence", () => {
  it("posts the full snapshot to the save endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(createJsonResponse(200, { success: true }));
    let state = createInitialGameState(PRACTICE_EVENTS, "game-1");

    state = gameReducer(state, { type: "BEGIN_START" });
    state = gameReducer(state, {
      type: "COMPLETE_PREFLIGHT",
      preflight: { passed: true, issues: [] }
    });
    state = gameReducer(state, { type: "START_ROUND" });
    state = gameReducer(state, { type: "END_CINEMATIC" });
    state = gameReducer(state, { type: "SET_YEAR", year: 1969 });
    state = gameReducer(state, { type: "SET_LOCATION", location: { lat: 10, lng: 20 } });

    await saveGameState(state, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith("/api/game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(state)
    });
  });

  it("loads a persisted snapshot by gameId", async () => {
    const persisted = createInitialGameState(PRACTICE_EVENTS, "route-game");
    const fetchImpl = vi.fn().mockResolvedValue(createJsonResponse(200, persisted));

    await expect(loadGameState(persisted.gameId, fetchImpl)).resolves.toEqual(persisted);
    expect(fetchImpl).toHaveBeenCalledWith(`/api/game/${encodeURIComponent(persisted.gameId)}`, {
      cache: "no-store"
    });
  });

  it("returns null when the persisted snapshot does not exist", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(createJsonResponse(404, { error: "Game not found" }));

    await expect(loadGameState("missing-game", fetchImpl)).resolves.toBeNull();
  });

  it("boots from the route gameId when a saved snapshot exists", async () => {
    const persisted = createInitialGameState(REAL_EVENTS, "route-game");
    const fetchImpl = vi.fn().mockResolvedValue(createJsonResponse(200, persisted));

    await expect(
      bootGameState({
        routeGameId: persisted.gameId,
        events: REAL_EVENTS,
        fetchImpl
      })
    ).resolves.toEqual(persisted);
  });

  it("ignores a persisted snapshot when its events do not include real images", async () => {
    const stalePersisted = createInitialGameState(PRACTICE_EVENTS, "route-game");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(200, stalePersisted))
      .mockResolvedValueOnce(createJsonResponse(200, { success: true }));

    const booted = await bootGameState({
      routeGameId: stalePersisted.gameId,
      events: REAL_EVENTS,
      fetchImpl
    });

    expect(booted.gameId).not.toBe(stalePersisted.gameId);
    expect(booted.events).toEqual(REAL_EVENTS);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, `/api/game/${encodeURIComponent(stalePersisted.gameId)}`, {
      cache: "no-store"
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "/api/game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(booted)
    });
  });

  it("creates and persists a new game when the requested snapshot does not exist", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(404, { error: "Game not found" }))
      .mockResolvedValueOnce(createJsonResponse(200, { success: true }));

    const booted = await bootGameState({
      routeGameId: "missing-game",
      events: REAL_EVENTS,
      fetchImpl
    });

    expect(booted.gameId).not.toBe("missing-game");
    expect(fetchImpl).toHaveBeenNthCalledWith(1, "/api/game/missing-game", {
      cache: "no-store"
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "/api/game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(booted)
    });
  });

  it("creates and persists a new game when no route gameId is provided", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(createJsonResponse(200, { success: true }));

    const booted = await bootGameState({
      events: REAL_EVENTS,
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("/api/game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(booted)
    });
  });

  it("builds canonical share paths from gameId", () => {
    expect(buildGamePath("abc-123")).toBe("/game/abc-123");
  });

  it("rejects creating a new session when the event batch has no real images", async () => {
    const fetchImpl = vi.fn();

    await expect(
      bootGameState({
        events: PRACTICE_EVENTS,
        fetchImpl
      })
    ).rejects.toThrow("Unable to create a game because real events with images could not be loaded from the database");
  });
});
