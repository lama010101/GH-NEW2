import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ADDRESS_TYPES = new Set([
  "city",
  "town",
  "village",
  "county",
  "state",
  "country",
]);

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function rankAndFilter(
  data: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const filtered = data.filter((r) => {
    const t =
      (typeof r.addresstype === "string" && r.addresstype) ||
      (typeof r.type === "string" && r.type) ||
      (typeof r.class === "string" && r.class) ||
      "";
    return ALLOWED_ADDRESS_TYPES.has(t);
  });
  filtered.sort(
    (a, b) =>
      (typeof b.importance === "number" ? b.importance : 0) -
      (typeof a.importance === "number" ? a.importance : 0)
  );
  return filtered;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 2) {
    return NextResponse.json([]);
  }
  const stripped = stripDiacritics(q);
  const buildUrl = (query: string) =>
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=50`;
  const headers = {
    "Accept-Language": "en",
    "User-Agent": "GuessHistory/1.0 (contact@guesshistory.app)",
    "Accept": "application/json",
  };
  try {
    let res = await fetch(buildUrl(stripped), { headers });
    if (!res.ok) {
      return NextResponse.json([], { status: res.status });
    }
    let data = (await res.json()) as Array<Record<string, unknown>>;
    let ranked = rankAndFilter(data);
    if (ranked.length === 0 && stripped !== q) {
      res = await fetch(buildUrl(q), { headers });
      if (res.ok) {
        data = (await res.json()) as Array<Record<string, unknown>>;
        ranked = rankAndFilter(data);
      }
    }
    return NextResponse.json(ranked);
  } catch {
    return NextResponse.json([], { status: 502 });
  }
}
