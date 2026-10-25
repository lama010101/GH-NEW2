// Positional podium/list partition for the leaderboard page
// (MP-UIX-PORT-B-PODIUMFIX-1015-001). Entries arrive rank-normalised and in
// ascending-rank order from /api/leaderboard (every ranked query ends
// ORDER BY rank). Ties are normal — RANK() semantics produce rank sequences
// like 1,1,1,6 — so the split is by array position, never by rank value:
// podium = the first min(3, n) entries, list = every remaining entry.
// Nobody is dropped and nobody appears twice.

export type PodiumPartition<T> = {
  podium: T[];
  list: T[];
};

export function partitionPodium<T>(entries: readonly T[]): PodiumPartition<T> {
  const podium = entries.slice(0, Math.min(3, entries.length));
  return { podium, list: entries.slice(podium.length) };
}
