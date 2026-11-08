// AIP-BUILD-FLEETFINAL-1103-060 (D9) — supervisor query-count instrumentation.
//
// wrapPool(pool) returns a same-shape pool whose .query tallies each call.
// A caller may pass an optional 3rd `label` argument (NOT forwarded to pg);
// without one the normalized SQL text itself is the caller tag. Counts print
// via reportQueryCounts(). Everything is inert unless AI_QUERY_COUNT=1.

type PgQuery = (text: unknown, values?: unknown[]) => Promise<unknown>;
type PoolLike = { query: PgQuery };

const counts = new Map<string, number>();

function callerTag(text: unknown): string {
  if (typeof text !== "string" || text.trim().length === 0) return "(non-text query)";
  return text.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function wrapPool<T extends PoolLike>(pool: T): T {
  if (process.env.AI_QUERY_COUNT !== "1") return pool;
  // Object.create keeps every other member (end/connect/release) bound to the
  // real pool through the prototype chain; only `query` is shadowed.
  const wrapped = Object.create(pool) as T;
  wrapped.query = function (text: unknown, values?: unknown[], label?: string) {
    const key = label ?? callerTag(text);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    // `label` is our own arg — pg only ever receives what the caller sent.
    return values === undefined
      ? pool.query.call(pool, text)
      : pool.query.call(pool, text, values);
  } as T["query"];
  return wrapped;
}

export function reportQueryCounts(): void {
  if (process.env.AI_QUERY_COUNT !== "1") return;
  let total = 0;
  for (const n of counts.values()) total += n;
  console.log(`[QUERY-COUNT] total=${total}`);
  for (const [label, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`[QUERY-COUNT] ${n}  ${label}`);
  }
}
