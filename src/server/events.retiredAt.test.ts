// EDQ-BUILD-RETIREDAT-1102-038
// retired_at draw/read split: every NEW draw must exclude retired events
// (e.retired_at IS NULL); read-by-id paths must stay retired_at-agnostic so a
// withdrawn event (status kept 'validated') remains readable for past and
// in-flight sessions.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { dbPool } from "./db";
import { fetchEventsWithDetails, fetchEventById } from "./events";
import { getOrCreateDailyChallenge } from "./dailyChallenge";
import { loadEventLearn } from "./learnEvent";

vi.mock("./db", () => ({
  dbPool: {
    query: vi.fn(),
  },
}));

const EVENT_ID = "11111111-2222-3333-4444-555555555555";
const OTHER_EVENT_ID = "00000000-0000-0000-0000-000000000006";
const GAME_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const PLAYER_ID = "99999999-8888-7777-6666-555555555555";
const ELIGIBLE_IDS = [
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
  "00000000-0000-0000-0000-000000000003",
  "00000000-0000-0000-0000-000000000004",
  "00000000-0000-0000-0000-000000000005",
];

function makeExecutor() {
  const calls: string[] = [];
  const executor = {
    query: async (sql: string) => {
      calls.push(sql);
      return { rows: [] as never[] };
    },
  };
  return { calls, executor };
}

type EventsExecutor = NonNullable<Parameters<typeof fetchEventsWithDetails>[1]>;
type ByIdExecutor = NonNullable<Parameters<typeof fetchEventById>[1]>;

function recordedSql(): string[] {
  return vi.mocked(dbPool.query).mock.calls.map((c) => String(c[0]));
}

beforeEach(() => {
  vi.mocked(dbPool.query).mockReset();
});

describe("retired_at draw predicates (EDQ-BUILD-RETIREDAT-1102-038)", () => {
  it("fetchEventsWithDetails draw WHERE includes e.retired_at IS NULL", async () => {
    const { calls, executor } = makeExecutor();
    const result = await fetchEventsWithDetails({}, executor as unknown as EventsExecutor);
    expect(result).toEqual([]);
    expect(calls[0]).toContain("e.status = 'validated'");
    expect(calls[0]).toContain("e.retired_at IS NULL");
  });

  it("fetchAllEligibleEventIds (daily pool) includes e.retired_at IS NULL", async () => {
    let dailySelects = 0;
    vi.mocked(dbPool.query).mockImplementation(async (sql: string): Promise<any> => {
      if (sql.includes("FROM daily_challenges")) {
        dailySelects += 1;
        return dailySelects === 1
          ? { rows: [] }
          : { rows: [{ date: "2030-01-01", seed: "42", event_ids: ELIGIBLE_IDS }] };
      }
      if (sql.includes("FROM events e")) {
        return { rows: ELIGIBLE_IDS.map((id) => ({ id })) };
      }
      return { rows: [] };
    });

    const challenge = await getOrCreateDailyChallenge("2030-01-01");
    expect(challenge.event_ids).toHaveLength(5);

    const poolSql = recordedSql().find((s) => s.includes("FROM events e"));
    expect(poolSql).toBeDefined();
    expect(poolSql).toContain("e.status = 'validated'");
    expect(poolSql).toContain("e.retired_at IS NULL");
  });
});

describe("retired_at read-by-id predicates (EDQ-BUILD-RETIREDAT-1102-038)", () => {
  it("fetchEventById keeps e.status='validated' and has no retired_at predicate", async () => {
    const { calls, executor } = makeExecutor();
    const result = await fetchEventById(EVENT_ID, executor as unknown as ByIdExecutor);
    expect(result).toBeNull();
    expect(calls[0]).toContain("e.status = 'validated'");
    expect(calls[0]).not.toContain("retired_at");
  });

  it("loadEventLearn: self-fetch has no retired_at predicate; candidates has it", async () => {
    vi.mocked(dbPool.query).mockImplementation(async (sql: string): Promise<any> => {
      if (sql.includes("FROM sessions")) return { rows: [{ ok: true }] };
      if (sql.includes("payload->'eventIds'"))
        return { rows: [{ event_ids: [EVENT_ID, OTHER_EVENT_ID] }] };
      if (sql.includes("FROM round_results")) return { rows: [{ round_index: 0 }] };
      if (sql.includes("e.id = $1::uuid"))
        return {
          rows: [
            {
              description: "d",
              title: "T",
              event_year: 1900,
              latitude: 1,
              longitude: 1,
              display_name: "L",
            },
          ],
        };
      if (sql.includes("FROM hints")) return { rows: [] };
      if (sql.includes("e.id <> $1::uuid")) return { rows: [] };
      return { rows: [] };
    });

    const result = await loadEventLearn({
      eventId: EVENT_ID,
      gameId: GAME_ID,
      playerId: PLAYER_ID,
      mode: "practice",
    });
    expect(result.status).toBe("ok");

    const calls = recordedSql();
    const selfFetch = calls.find((s) => s.includes("e.id = $1::uuid"));
    const candidatesFetch = calls.find((s) => s.includes("e.id <> $1::uuid"));
    expect(selfFetch).toBeDefined();
    expect(selfFetch).not.toContain("retired_at");
    expect(candidatesFetch).toBeDefined();
    expect(candidatesFetch).toContain("e.retired_at IS NULL");
  });
});
