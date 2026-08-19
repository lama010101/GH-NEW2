// AIP-BUILD-DAILYBOUNDARY-UTC14-001
// Single source of truth for the Daily-challenge calendar date boundary.
// The Daily opens when UTC+14 (Pacific/Kiritimati, Kiribati / Line Islands)
// reaches local midnight, which is 10:00:00 UTC. This is the earliest timezone
// on Earth to start a new calendar day, so the challenge becomes available to
// the whole world before most local midnights.

const KIRITIMATI_TZ = "Pacific/Kiritimati";

/**
 * getDailyChallengeDate — returns the ISO date (YYYY-MM-DD) for the UTC+14
 * (Pacific/Kiritimati) calendar day containing referenceDate (defaults to now).
 * This is the authoritative "what Daily date is it right now?" value.
 */
export function getDailyChallengeDate(referenceDate?: Date): string {
  const d = referenceDate ?? new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: KIRITIMATI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Failed to extract UTC+14 date parts");
  }
  return `${year}-${month}-${day}`;
}

/**
 * getNextDailyRollover — returns the next Date when the UTC+14 calendar day
 * increments, i.e., the next occurrence of 10:00 UTC.
 */
export function getNextDailyRollover(referenceDate?: Date): Date {
  const d = referenceDate ?? new Date();
  // 10:00 UTC == 00:00 UTC+14 (Kiritimati / Line Islands)
  const rollover = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 10, 0, 0, 0));
  if (rollover.getTime() <= d.getTime()) {
    rollover.setUTCDate(rollover.getUTCDate() + 1);
  }
  return rollover;
}
