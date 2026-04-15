import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRACTICE_EVENTS } from "@/core/mockEvents";
import { evaluateRound } from "@/core/rules";
import type { EventRecord, LatLng, RoundResult } from "@/core/types";

const PRACTICE_PLAYER_ID = "00000000-0000-0000-0000-000000000000";

const mocks = vi.hoisted(() => ({
  dbPoolQuery: vi.fn(),
  dbPoolConnect: vi.fn(),
  fetchEventByIdMock: vi.fn(),
  fetchRandomEventsForSessionMock: vi.fn()
}));

vi.mock("@/server/db", () => ({
  dbPool: {
    query: mocks.dbPoolQuery,
    connect: mocks.dbPoolConnect
  }
}));

vi.mock("@/server/events", () => ({
  fetchEventById: mocks.fetchEventByIdMock,
  fetchRandomEventsForSession: mocks.fetchRandomEventsForSessionMock
}));

import { commitPracticeRound, loadPracticeSessionState } from "./practiceSessions";

type QueryResult = {
  rows?: unknown[];
};

type MockTransactionClient = {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
};

const REAL_EVENTS: EventRecord[] = PRACTICE_EVENTS.map((event, index) => ({
  ...event,
  imageUrl: `https://example.com/event-${index + 1}.jpg`,
  thumbUrl: `https://example.com/event-${index + 1}-thumb.jpg`
}));

function eventCoordinates(event: EventRecord): LatLng {
  return {
    lat: event.location.lat,
    lng: event.location.lng
  };
}

function createMockClient(results: QueryResult[]): MockTransactionClient {
  return {
    query: vi.fn().mockImplementation(async () => results.shift() ?? { rows: [] }),
    release: vi.fn()
  };
}

function createSessionEventRows() {
  return REAL_EVENTS.map((event, roundIndex) => ({
    round_index: roundIndex,
    event_id: event.id
  }));
}

function createStoredRoundResult(row: {
  roundIndex: number;
  result: RoundResult;
  locationGuess: LatLng | null;
  yearGuess: number | null;
}) {
  return {
    player_id: PRACTICE_PLAYER_ID,
    round_index: row.roundIndex,
    submitted_at: new Date("2026-04-04T12:00:00.000Z"),
    year_guess: row.yearGuess,
    location_guess: row.locationGuess,
    hints_used: [],
    result_payload: row.result
  };
}

function createSessionRow() {
  return {
    game_id: "game-1",
    version: 2,
    mode: "practice",
    round_timer_sec: 30,
    total_rounds: REAL_EVENTS.length,
    year_min: -100,
    year_max: 2026,
    host_player_id: PRACTICE_PLAYER_ID,
    session_deadline: null,
    started_at: null,
    completed_at: null,
    created_at: new Date("2026-04-04T11:55:00.000Z")
  };
}

function createSessionPlayerRows() {
  return [
    {
      player_id: PRACTICE_PLAYER_ID,
      display_name: "Practice Player",
      joined_at: new Date("2026-04-04T11:55:00.000Z"),
      left_at: null,
      ready: true,
      is_host: true
    }
  ];
}

beforeEach(() => {
  mocks.dbPoolQuery.mockReset();
  mocks.dbPoolConnect.mockReset();
  mocks.fetchEventByIdMock.mockReset();
  mocks.fetchRandomEventsForSessionMock.mockReset();
  mocks.fetchEventByIdMock.mockImplementation(async (eventId: string) => REAL_EVENTS.find((event) => event.id === eventId) ?? null);
});

describe("practiceSessions", () => {
  it("materializes an expired active round as a timeout during authoritative reconstruction", async () => {
    const eventRows = createSessionEventRows();
    const sessionRow = createSessionRow();
    const sessionPlayers = createSessionPlayerRows();
    const expiredStartedAt = new Date(Date.now() - 31_000);
    const timeoutResult = evaluateRound(REAL_EVENTS[0], { year: null, location: null }, 0, true, { accuracy: 0, xp: 0 });
    const timeoutClient = createMockClient([
      {},
      { rows: [] },
      { rows: [{ round_index: 0, started_at: expiredStartedAt }] },
      { rows: eventRows },
      {},
      { rows: sessionPlayers }
    ]);

    mocks.dbPoolConnect.mockResolvedValueOnce(timeoutClient);
    mocks.dbPoolQuery
      .mockResolvedValueOnce({ rows: [sessionRow] })
      .mockResolvedValueOnce({ rows: eventRows })
      .mockResolvedValueOnce({ rows: [{ round_index: 0, started_at: expiredStartedAt }] })
      .mockResolvedValueOnce({ rows: [createStoredRoundResult({ roundIndex: 0, result: timeoutResult, locationGuess: null, yearGuess: null })] })
      .mockResolvedValueOnce({ rows: sessionPlayers });

    const state = await loadPracticeSessionState("game-1");

    expect(state).not.toBeNull();
    expect(state?.phase).toBe("ROUND_COMPLETE");
    expect(state?.roundResults).toHaveLength(1);
    expect(state?.roundResults[0].didTimeout).toBe(true);
    expect(state?.sessionPlayers).toHaveLength(1);
    expect(state?.viewerPlayerId).toBe(PRACTICE_PLAYER_ID);
    expect(timeoutClient.query.mock.calls.some((call) => String(call[0]).includes("INSERT INTO round_commits"))).toBe(true);
  });

  it("returns the existing committed round on duplicate commit without inserting again", async () => {
    const eventRows = createSessionEventRows();
    const sessionRow = createSessionRow();
    const sessionPlayers = createSessionPlayerRows();
    const existingResult = evaluateRound(
      REAL_EVENTS[0],
      { year: REAL_EVENTS[0].year, location: eventCoordinates(REAL_EVENTS[0]) },
      0,
      false,
      { accuracy: 0, xp: 0 }
    );
    const existingCommit = createStoredRoundResult({
      roundIndex: 0,
      result: existingResult,
      yearGuess: REAL_EVENTS[0].year,
      locationGuess: eventCoordinates(REAL_EVENTS[0])
    });

    const materializeBeforeCommit = createMockClient([
      {},
      { rows: [existingCommit] },
      { rows: [] },
      {}
    ]);
    const duplicateCommitClient = createMockClient([
      {},
      { rows: [sessionRow] },
      { rows: [existingCommit] },
      {}
    ]);
    const materializeDuringReload = createMockClient([
      {},
      { rows: [existingCommit] },
      { rows: [] },
      {}
    ]);

    mocks.dbPoolConnect
      .mockResolvedValueOnce(materializeBeforeCommit)
      .mockResolvedValueOnce(duplicateCommitClient)
      .mockResolvedValueOnce(materializeDuringReload);

    mocks.dbPoolQuery
      .mockResolvedValueOnce({ rows: [sessionRow] })
      .mockResolvedValueOnce({ rows: eventRows })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [existingCommit] })
      .mockResolvedValueOnce({ rows: sessionPlayers });

    const state = await commitPracticeRound({
      gameId: "game-1",
      roundIndex: 0,
      yearGuess: REAL_EVENTS[0].year,
      locationGuess: eventCoordinates(REAL_EVENTS[0]),
      hintsUsed: []
    });

    expect(state.phase).toBe("ROUND_COMPLETE");
    expect(state.roundResults).toHaveLength(1);
    expect(state.roundResults[0].roundAccuracy).toBe(existingResult.roundAccuracy);
    expect(state.sessionPlayers).toHaveLength(1);
    expect(duplicateCommitClient.query.mock.calls.some((call) => String(call[0]).includes("INSERT INTO round_commits"))).toBe(false);
  });

  it("rejects unsupported hint payloads before any database interaction", async () => {
    await expect(
      commitPracticeRound({
        gameId: "game-1",
        roundIndex: 0,
        yearGuess: 1969,
        locationGuess: eventCoordinates(REAL_EVENTS[0]),
        hintsUsed: ["hint-1"]
      })
    ).rejects.toThrow("Hints are not yet enabled for secure server commits");

    expect(mocks.dbPoolConnect).not.toHaveBeenCalled();
    expect(mocks.dbPoolQuery).not.toHaveBeenCalled();
  });
});
