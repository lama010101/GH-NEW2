import { describe, expect, it } from "vitest";
import { buildDailyShareCard, type DailyShareCardInput } from "./dailyShareCard";

const BASE: DailyShareCardInput = {
  rounds: [
    { locationScore: 91, timeScore: 87 },
    { locationScore: 72, timeScore: 64 },
    { locationScore: 48, timeScore: 33 },
    { locationScore: 15, timeScore: 22 },
    { locationScore: 83, timeScore: 77 },
  ],
  totalAccuracyPct: 59,
  streak: 4,
  dateIso: "2026-11-11",
  brand: "Back to the Past",
  origin: "https://example.com",
};

function cardWithScore(score: number): string | null {
  return buildDailyShareCard({
    ...BASE,
    rounds: Array.from({ length: 5 }, () => ({
      locationScore: score,
      timeScore: score,
    })),
  });
}

function firstRoundRow(card: string | null): string {
  expect(card).not.toBeNull();
  return card!.split("\n")[1];
}

describe("buildDailyShareCard tier boundaries", () => {
  it.each([
    [84.99, "🟨🟨"],
    [85, "🟩🟩"],
    [59.99, "🟧🟧"],
    [60, "🟨🟨"],
    [39.99, "🟥🟥"],
    [40, "🟧🟧"],
    [0, "🟥🟥"],
    [100, "🟩🟩"],
    [Number.NaN, "⬜⬜"],
    [-5, "⬜⬜"],
    [150, "🟩🟩"],
  ])("score %s -> %s", (score, expected) => {
    expect(firstRoundRow(cardWithScore(score))).toBe(expected);
  });
});

describe("buildDailyShareCard output", () => {
  it("produces the exact expected card for the sample game", () => {
    expect(buildDailyShareCard(BASE)).toBe(
      [
        "Back to the Past Daily · 2026-11-11",
        "🟩🟩",
        "🟨🟨",
        "🟧🟥",
        "🟥🟥",
        "🟨🟨",
        "59% · 🔥4",
        "https://example.com",
      ].join("\n")
    );
  });

  it("returns null when rounds.length !== 5", () => {
    expect(
      buildDailyShareCard({ ...BASE, rounds: BASE.rounds.slice(0, 4) })
    ).toBeNull();
    expect(
      buildDailyShareCard({ ...BASE, rounds: [...BASE.rounds, BASE.rounds[0]] })
    ).toBeNull();
    expect(buildDailyShareCard({ ...BASE, rounds: [] })).toBeNull();
  });

  it("omits the streak flame when streak is null", () => {
    const card = buildDailyShareCard({ ...BASE, streak: null });
    expect(card).not.toBeNull();
    expect(card!.split("\n")[6]).toBe("59%");
  });

  it("omits the streak flame when streak is 0", () => {
    const card = buildDailyShareCard({ ...BASE, streak: 0 });
    expect(card).not.toBeNull();
    expect(card!.split("\n")[6]).toBe("59%");
  });

  it("omits the date suffix when dateIso is null", () => {
    const card = buildDailyShareCard({ ...BASE, dateIso: null });
    expect(card).not.toBeNull();
    expect(card!.split("\n")[0]).toBe("Back to the Past Daily");
  });

  it("matches the spoiler-free structural allowlist", () => {
    const card = buildDailyShareCard(BASE);
    expect(card).not.toBeNull();
    expect(card!).toMatch(
      /^.{1,80}\n(?:[🟥🟧🟨🟩⬜]{2}\n){5}\d{1,3}%(?: · 🔥\d+)?\n\S+$/u
    );
  });
});
