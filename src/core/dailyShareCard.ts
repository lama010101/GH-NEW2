import { getAccuracyColor } from "./accuracyColor";

export type DailyShareCardRound = {
  locationScore: number;
  timeScore: number;
};

export type DailyShareCardInput = {
  rounds: DailyShareCardRound[];
  totalAccuracyPct: number;
  streak: number | null;
  dateIso: string | null;
  brand: string;
  origin: string;
};

const TIER_EMOJI: Record<string, string> = {
  "var(--gh-success)": "🟩",
  "var(--gh-gold)": "🟨",
  "var(--gh-orange)": "🟧",
  "var(--gh-danger)": "🟥",
};

function cellTier(score: number): string {
  if (!Number.isFinite(score) || score < 0) return "⬜";
  return TIER_EMOJI[getAccuracyColor(score)] ?? "⬜";
}

export function buildDailyShareCard(input: DailyShareCardInput): string | null {
  if (input.rounds.length !== 5) return null;
  const lines = [
    `${input.brand} Daily${input.dateIso ? ` · ${input.dateIso}` : ""}`,
  ];
  for (const round of input.rounds) {
    lines.push(`${cellTier(round.locationScore)}${cellTier(round.timeScore)}`);
  }
  const pct = Number.isFinite(input.totalAccuracyPct)
    ? Math.round(input.totalAccuracyPct)
    : 0;
  const streak =
    typeof input.streak === "number" &&
    Number.isFinite(input.streak) &&
    input.streak > 0
      ? Math.round(input.streak)
      : 0;
  lines.push(`${pct}%${streak > 0 ? ` · 🔥${streak}` : ""}`);
  lines.push(input.origin);
  return lines.join("\n");
}
