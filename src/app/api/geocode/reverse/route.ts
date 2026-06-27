import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lon = req.nextUrl.searchParams.get("lon");
  const zoom = req.nextUrl.searchParams.get("zoom") ?? "10";

  if (!lat || !lon) {
    return NextResponse.json({ error: "lat and lon are required" }, { status: 400 });
  }

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);

  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    return NextResponse.json({ error: "lat and lon must be valid numbers" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&format=json&zoom=${encodeURIComponent(zoom)}`,
      {
        headers: {
          "Accept-Language": "en",
          "User-Agent": "GuessHistory/1.0 (contact@guesshistory.app)",
          "Accept": "application/json",
        },
      }
    );
    if (!res.ok) {
      return NextResponse.json({ error: "Geocode failed" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Geocode service unavailable" }, { status: 502 });
  }
}
