"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Merged "Where" + "When" bottom-sheet modals
// Route: /prototype/guess-modal   (direct access, self-contained)
//
// - Both WHERE and WHEN open from the same page (one sheet at a time).
// - WHEN button is placed LEFT of WHERE so the WHERE answer tag can extend
//   further to the right.
// - WHERE button = blue, WHEN button = purple; both use their card webp icons.
// - WHERE search field: icon inside, full width, at the BOTTOM, styled exactly
//   like the "Enter year" field.
// - Dragging the WHERE sheet UP expands it to full screen (guess + search
//   stay visible). Dragging DOWN collapses / dismisses.
//
// Does NOT touch any existing files. Reuses GameMap + YearPicker (read-only).
// ============================================================================

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { YearPicker } from "@/components/YearPicker";

const GameMap = dynamic(
  () => import("@/components/GameMap").then((m) => m.GameMap),
  { ssr: false }
);

type Panel = "where" | "when" | null;
type LatLng = { lat: number; lng: number };

const YEAR_MIN = 1850;
const YEAR_MAX = 2025;

export default function GuessModalPrototypePage() {
  const [panel, setPanel] = useState<Panel>(null);

  // WHERE state
  const [guess, setGuess] = useState<LatLng | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ displayName: string; lat: number; lng: number }>
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; id: number } | null>(null);
  const flyId = useRef(0);

  // WHEN state
  const [guessYear, setGuessYear] = useState<number | null>(null);
  const [yearEditValue, setYearEditValue] = useState("");

  // Sheet drag / fullscreen
  const [expanded, setExpanded] = useState(false); // WHERE fullscreen
  const [sheetDrag, setSheetDrag] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const rawDy = useRef(0);

  // ── Geocoding ──────────────────────────────────────────────────────────
  const reverseGeocode = async (lat: number, lng: number) => {
    setLocationLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
        { headers: { "Accept-Language": "en", "User-Agent": "GuessHistory/1.0" } }
      );
      if (!res.ok) throw new Error("geocode failed");
      const data = await res.json();
      const a = data.address ?? {};
      const primary =
        a.city || a.town || a.village || a.municipality || a.county || a.state || "";
      const country = a.country || "";
      setLocationName(
        primary && country ? `${primary}, ${country}` : primary || country || "Unknown location"
      );
    } catch {
      setLocationName(null);
    } finally {
      setLocationLoading(false);
    }
  };

  const setLocation = (loc: LatLng) => {
    setGuess(loc);
    reverseGeocode(loc.lat, loc.lng);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (value.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchDebounce.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=json&limit=5`,
          { headers: { "Accept-Language": "en", "User-Agent": "GuessHistory/1.0" } }
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        setSearchResults(
          (data as Array<{ display_name: string; lat: string; lon: string }>).map((r) => ({
            displayName: r.display_name.split(",").slice(0, 3).join(",").trim(),
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
          }))
        );
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  };

  const selectSearchResult = (r: { displayName: string; lat: number; lng: number }) => {
    flyId.current += 1;
    setFlyTo({ lat: r.lat, lng: r.lng, id: flyId.current });
    setGuess({ lat: r.lat, lng: r.lng });
    setLocationName(r.displayName);
    setSearchQuery("");
    setSearchResults([]);
  };

  const locationLabel = guess
    ? locationLoading
      ? "…"
      : locationName ?? "Location set ✓"
    : "No location set";

  // ── Sheet open/close ─────────────────────────────────────────────────────
  const openPanel = (p: Exclude<Panel, null>) => {
    setPanel((prev) => (prev === p ? null : p));
    setExpanded(false);
    setSheetDrag(0);
  };

  const closeModal = () => {
    setPanel(null);
    setExpanded(false);
    setSheetDrag(0);
    dragStartY.current = null;
    setSearchQuery("");
    setSearchResults([]);
  };

  // ── Drag handlers (handle-only gesture) ───────────────────────────────────
  const onHandleDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    rawDy.current = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.clientY - dragStartY.current;
    rawDy.current = dy;
    setSheetDrag(Math.max(0, dy)); // visual translate only for downward drag
  };
  const onHandleUp = () => {
    if (dragStartY.current === null) return;
    const dy = rawDy.current;
    const canExpand = panel === "where"; // fullscreen applies to WHERE card

    if (canExpand && !expanded && dy < -70) {
      setExpanded(true);
    } else if (canExpand && expanded && dy > 120) {
      setExpanded(false);
    } else if (!expanded && dy > 140) {
      closeModal();
    }
    dragStartY.current = null;
    rawDy.current = 0;
    setSheetDrag(0);
  };

  return (
    <main className="screen">
      <div className="protoBar">
        <span className="protoTitle">Where + When Modal — Prototype</span>
        <span className="protoHint">Drag WHERE sheet up for fullscreen</span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/home_background.webp" alt="Historical event" className="bgImg" draggable={false} />
      <div className="bgScrim" />

      <div className="roundPill">3 / 5</div>

      {/* ── Navbar — order: Hints · WHEN · WHERE · Submit ── */}
      <div className="navbar">
        <button type="button" className="circleBtn hintsBtn" aria-label="Hints">
          <span className="hintsCount">0</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.663 17h4.673M12 3v1m0 16v1M4.22 4.22l.707.707M19.778 19.778l-.707-.707M3 12h1m16 0h1M4.22 19.778l.707-.707M19.778 4.22l-.707.707M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z" />
          </svg>
        </button>

        {/* WHEN (left of WHERE) */}
        <div className="circleWrap">
          <span className={`overlayTag overlayTagWhen ${guessYear !== null ? "overlayTagAnswer" : ""}`}>
            {guessYear !== null ? String(guessYear) : "WHEN"}
          </span>
          <button
            type="button"
            className={`circleBtn whenBtn ${panel === "when" ? "btnActive" : guessYear === null ? "whenBtnGlow" : ""}`}
            onClick={() => openPanel("when")}
            aria-label="When"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/badges/when.webp" alt="When" className="btnIcon" />
          </button>
        </div>

        {/* WHERE (right of WHEN — answer can extend rightward) */}
        <div className="circleWrap circleWrapWhere">
          <span className={`overlayTag overlayTagWhere ${guess ? "overlayTagWhereAnswer" : ""}`}>
            {guess ? (locationLoading ? "…" : (locationName ?? "✓").split(",")[0].trim()) : "WHERE"}
          </span>
          <button
            type="button"
            className={`circleBtn whereBtn ${panel === "where" ? "btnActive" : !guess ? "whereBtnGlow" : ""}`}
            onClick={() => openPanel("where")}
            aria-label="Where"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/badges/where.webp" alt="Where" className="btnIcon" />
          </button>
        </div>

        <button type="button" className={`circleBtn submitBtn ${guess && guessYear !== null ? "submitActive" : ""}`} aria-label="Submit">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      {/* ════ BOTTOM SHEET ════ */}
      {panel !== null && (
        <>
          <div className="sheetBackdrop" onClick={closeModal} />
          <div
            className={`sheet ${expanded ? "sheetFull" : ""}`}
            style={{
              transform: `translateY(${sheetDrag}px)`,
              transition: dragStartY.current === null ? "transform 0.28s cubic-bezier(0.16,1,0.3,1)" : "none",
            }}
          >
            {/* Dedicated drag handle — the ONLY element that slides the sheet */}
            <div
              className="dragZone"
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
            >
              <div className="dragHandle" />
            </div>

            {/* ── WHERE ── */}
            {panel === "where" && (
              <>
                <div className="sheetHeader">
                  <div className="headerLeft">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/badges/where.webp" alt="" className="headerIcon" />
                    <div className="headerMeta">
                      <span className="headerValue">{locationLabel}</span>
                    </div>
                  </div>
                  <button type="button" className="closeBtn" onClick={closeModal} aria-label="Close">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <div className="sheetMap">
                  <GameMap
                    guessLocation={guess}
                    onSetLocation={setLocation}
                    hideZoomControls
                    flyToTarget={flyTo}
                  />
                </div>

                {/* Search field — icon inside, full width, at the bottom,
                    styled exactly like the "Enter year" field */}
                <div className="fieldWrap">
                  <svg className="fieldIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Search a place (city, country)…"
                    className="field fieldWithIcon"
                  />
                  {(searchResults.length > 0 || searchLoading) && (
                    <div className="searchDropdown">
                      {searchLoading && <div className="searchLoading">Searching…</div>}
                      {searchResults.map((r, i) => (
                        <button
                          key={i}
                          type="button"
                          onMouseDown={() => selectSearchResult(r)}
                          className={`searchResultBtn ${i > 0 ? "searchResultBorder" : ""}`}
                        >
                          {r.displayName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className={`confirmBtn confirmWhere ${guess ? "confirmReady" : ""}`}
                  onClick={closeModal}
                  disabled={!guess}
                >
                  {guess ? "Confirm location" : "Tap the map to set a location"}
                </button>
              </>
            )}

            {/* ── WHEN ── */}
            {panel === "when" && (
              <>
                <div className="sheetHeader">
                  <div className="headerLeft">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/badges/when.webp" alt="" className="headerIcon" />
                    <div className="headerMeta">
                      <span className="headerValue">
                        {guessYear !== null ? String(guessYear) : "No year set"}
                      </span>
                    </div>
                  </div>
                  <button type="button" className="closeBtn" onClick={closeModal} aria-label="Close">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <div className="pickerWrap">
                  <YearPicker
                    value={guessYear ?? Math.round((YEAR_MIN + YEAR_MAX) / 2)}
                    onChange={setGuessYear}
                    min={YEAR_MIN}
                    max={YEAR_MAX}
                    defaultScale="century"
                    valueIsCommitted={guessYear !== null}
                    className="w-full"
                  />
                </div>

                <div className="fieldWrap">
                  <input
                    type="number"
                    value={yearEditValue}
                    onChange={(e) => {
                      setYearEditValue(e.target.value);
                      const parsed = parseInt(e.target.value, 10);
                      if (!isNaN(parsed)) {
                        setGuessYear(Math.max(YEAR_MIN, Math.min(YEAR_MAX, parsed)));
                      }
                    }}
                    onFocus={(e) => {
                      setYearEditValue(guessYear !== null ? String(guessYear) : "");
                      setTimeout(() => e.target.select(), 10);
                    }}
                    placeholder={`Enter year (${YEAR_MIN}–${YEAR_MAX})`}
                    min={YEAR_MIN}
                    max={YEAR_MAX}
                    className="field"
                  />
                </div>

                <button
                  type="button"
                  className={`confirmBtn confirmWhen ${guessYear !== null ? "confirmReady" : ""}`}
                  onClick={closeModal}
                  disabled={guessYear === null}
                >
                  {guessYear !== null ? "Confirm year" : "Pick a year to continue"}
                </button>
              </>
            )}
          </div>
        </>
      )}

      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: #000; }
      `}</style>

      <style jsx>{`
        .screen {
          position: fixed; inset: 0; overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #fff; user-select: none;
        }
        .bgImg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .bgScrim {
          position: absolute; inset: 0;
          background: linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%);
        }

        .protoBar {
          position: absolute; top: 0; left: 0; right: 0; z-index: 60;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 10px 14px;
          background: rgba(10,10,12,0.6); backdrop-filter: blur(8px); flex-wrap: wrap;
        }
        .protoTitle { font-size: 13px; font-weight: 600; letter-spacing: 0.3px; opacity: 0.85; }
        .protoHint { font-size: 12px; font-weight: 600; opacity: 0.6; }

        .roundPill {
          position: absolute; top: 58px; right: 14px; z-index: 30;
          background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.15);
          border-radius: 999px; padding: 6px 14px; font-size: 13px; font-weight: 600;
        }

        /* ── Navbar ── */
        .navbar {
          position: absolute; left: 0; right: 0; bottom: 0; z-index: 30;
          display: flex; align-items: center; justify-content: center; gap: 14px;
          padding: 14px 16px calc(16px + env(safe-area-inset-bottom));
        }
        .circleBtn {
          flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          border-radius: 50%; border: 2px solid rgba(255,255,255,0.4);
          background: rgba(30,30,34,0.85);
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          cursor: pointer; position: relative;
        }
        .hintsBtn, .submitBtn { width: 52px; height: 52px; }
        .submitActive {
          background: var(--gh-orange, #f59e0b);
          color: #000;
          border-color: rgba(255,255,255,0.85);
          animation: ripplePulse 1.6s ease-in-out infinite;
        }
        @keyframes ripplePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.55); }
          50% { box-shadow: 0 0 0 8px rgba(245,158,11,0); }
        }
        .whereBtn, .whenBtn { width: 64px; height: 64px; overflow: hidden; }
        .submitBtn { color: #fff; }
        .btnIcon { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }

        /* WHERE = blue, WHEN = purple */
        .whereBtn { background: #06b6d4; border-color: rgba(255,255,255,0.85); }
        .whenBtn  { background: #8b5cf6; border-color: rgba(255,255,255,0.85); }
        .btnActive { border-color: #fff; box-shadow: 0 0 0 3px rgba(255,255,255,0.35), 0 2px 8px rgba(0,0,0,0.4); }
        .whereBtnGlow { animation: glowBlue 1.8s ease-in-out infinite; }
        .whenBtnGlow  { animation: glowViolet 1.8s ease-in-out infinite; }
        @keyframes glowBlue {
          0%, 100% { box-shadow: 0 2px 8px rgba(0,0,0,0.4), 0 0 0 0 rgba(6,182,212,0.55); }
          50% { box-shadow: 0 2px 8px rgba(0,0,0,0.4), 0 0 0 10px rgba(6,182,212,0); }
        }
        @keyframes glowViolet {
          0%, 100% { box-shadow: 0 2px 8px rgba(0,0,0,0.4), 0 0 0 0 rgba(139,92,246,0.55); }
          50% { box-shadow: 0 2px 8px rgba(0,0,0,0.4), 0 0 0 10px rgba(139,92,246,0); }
        }

        .hintsCount {
          position: absolute; top: -4px; right: -4px;
          background: var(--gh-orange, #f59e0b); color: #000;
          font-size: 11px; font-weight: 700; min-width: 18px; height: 18px;
          border-radius: 999px; display: flex; align-items: center; justify-content: center;
        }

        .circleWrap { display: flex; flex-direction: column; align-items: center; gap: 6px; position: relative; }
        .overlayTag {
          position: absolute;
          bottom: 100%;
          margin-bottom: 6px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2;
          border-radius: 999px; padding: 3px 10px;
          font-size: 12px; font-weight: 700; letter-spacing: 0.6px;
          pointer-events: none; white-space: nowrap;
          max-width: 110px; overflow: hidden; text-overflow: ellipsis;
        }
        .overlayTagWhere { background: rgba(6,182,212,0.95); }
        .overlayTagWhen { background: rgba(139,92,246,0.95); }
        .overlayTagAnswer { letter-spacing: 0.2px; text-transform: none; }
        .overlayTagWhereAnswer {
          left: 0;
          transform: none;
          right: auto;
          max-width: 200px;
          letter-spacing: 0.2px;
          text-transform: none;
        }

        /* ── Confirm button ── */
        .confirmBtn {
          width: 100%; margin-top: 14px; padding: 14px;
          border-radius: 14px; border: none;
          background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.6);
          font-size: 15px; font-weight: 700; cursor: not-allowed;
        }
        .confirmReady { color: #fff; cursor: pointer; }
        .confirmWhere.confirmReady { background: #06b6d4; box-shadow: 0 4px 16px rgba(6,182,212,0.4); }
        .confirmWhen.confirmReady  { background: #8b5cf6; box-shadow: 0 4px 16px rgba(139,92,246,0.4); }

        /* ── Bottom sheet ── */
        .sheetBackdrop {
          position: absolute; inset: 0; z-index: 40;
          background: rgba(0,0,0,0.45); animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .sheet {
          position: absolute; left: 0; right: 0; bottom: 0; z-index: 41;
          display: flex; flex-direction: column;
          height: 72vh;
          background: #121214;
          border-top-left-radius: 22px; border-top-right-radius: 22px;
          box-shadow: 0 -10px 40px rgba(0,0,0,0.6);
          padding: 0 16px 20px;
          animation: slideUp 0.3s cubic-bezier(0.16,1,0.3,1);
          transition: height 0.3s cubic-bezier(0.16,1,0.3,1);
        }
        .sheetFull {
          height: 100vh; height: 100dvh;
          border-top-left-radius: 0; border-top-right-radius: 0;
          padding-top: calc(env(safe-area-inset-top));
        }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .dragZone {
          padding: 12px 0 8px; display: flex; justify-content: center;
          cursor: grab; touch-action: none;
        }
        .dragZone:active { cursor: grabbing; }
        .dragHandle { width: 44px; height: 5px; border-radius: 999px; background: rgba(255,255,255,0.3); }

        .sheetHeader {
          display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
        }
        .headerLeft { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .headerIcon { width: 48px; height: 48px; object-fit: contain; flex-shrink: 0; }
        .headerMeta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .headerLabel { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; }
        .headerLabelWhere { color: #06b6d4; }
        .headerLabelWhen { color: #8b5cf6; }
        .headerValue {
          font-size: 16px; font-weight: 600; color: #fff;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          text-align: center;
        }
        .closeBtn {
          flex-shrink: 0; width: 34px; height: 34px;
          border-radius: 50%; border: none; background: rgba(255,255,255,0.1);
          color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer;
        }

        .sheetMap { flex: 1; min-height: 0; margin-top: 12px; border-radius: 16px; overflow: hidden; }
        .pickerWrap { margin-top: 18px; }

        /* ── Field (search + enter-year share identical styling) ── */
        .fieldWrap { position: relative; margin-top: 16px; }
        .field {
          width: 100%; box-sizing: border-box;
          background: rgba(255,255,255,0.12);
          border: 1.5px solid rgba(255,255,255,0.35);
          border-radius: 12px; color: #fff; font-size: 15px;
          padding: 12px 14px; outline: none;
        }
        .field::placeholder { color: rgba(255,255,255,0.5); }
        .fieldWithIcon { padding-left: 42px; }
        .fieldIcon {
          position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
          color: rgba(255,255,255,0.6); pointer-events: none;
        }
        /* search results open upward (field is at the bottom) */
        .searchDropdown {
          position: absolute; left: 0; right: 0; bottom: calc(100% + 6px);
          background: #16161a; border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px; overflow: hidden; z-index: 5;
          box-shadow: 0 8px 28px rgba(0,0,0,0.5);
        }
        .searchLoading { padding: 12px 14px; font-size: 13px; color: rgba(255,255,255,0.4); }
        .searchResultBtn {
          width: 100%; text-align: left; padding: 11px 14px;
          background: transparent; border: none; color: #fff; font-size: 14px;
          cursor: pointer; display: block;
        }
        .searchResultBorder { border-top: 1px solid rgba(255,255,255,0.07); }
        .searchResultBtn:hover { background: rgba(255,255,255,0.06); }
      `}</style>
    </main>
  );
}
