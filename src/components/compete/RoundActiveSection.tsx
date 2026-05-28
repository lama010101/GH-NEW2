"use client";

import type { CompeteSessionSnapshot, SessionPlayer } from "@/core/types";
import dynamic from "next/dynamic";
import { useState, useRef, useEffect } from "react";
import { YearPicker } from "@/components/YearPicker";
import styles from "./RoundActiveSection.module.css";

const GameMap = dynamic(
  () => import("@/components/GameMap").then((m) => m.GameMap),
  { ssr: false }
);

interface RoundActiveSectionProps {
  snapshot: CompeteSessionSnapshot;
  playerId: string | null;
  guessYear: number | null;
  guessLat: number | null;
  guessLng: number | null;
  hasSubmitted: boolean;
  localSubmitted: boolean;
  busy: boolean;
  onSetLocation: (location: { lat: number; lng: number }) => void;
  onSetYear: (year: number | null) => void;
  onSubmit: () => void;
  onOpenHints: () => void;
  guessYearRef: React.MutableRefObject<number | null>;
  viewer: SessionPlayer | null;
  timeRemaining: number | null;
  hintsUsedCount?: number;
  hintsTotalCount?: number;
  localPlayerAvatarUrl?: string | null;
}


export default function RoundActiveSection({
  snapshot,
  playerId,
  guessYear,
  guessLat,
  guessLng,
  hasSubmitted,
  localSubmitted,
  busy,
  onSetLocation,
  onSetYear,
  onSubmit,
  onOpenHints,
  guessYearRef,
  timeRemaining,
  hintsTotalCount,
  hintsUsedCount,
  localPlayerAvatarUrl,
}: RoundActiveSectionProps) {
  const currentEvent = snapshot.rounds?.[snapshot.currentRoundIndex];
  const guessLocation =
    guessLat !== null && guessLng !== null
      ? { lat: guessLat, lng: guessLng }
      : null;

  const [panelVisible, setPanelVisible] = useState(false);
  const [cinematicDone, setCinematicDone] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [yearEditActive, setYearEditActive] = useState(false);
  const [yearEditValue, setYearEditValue] = useState("");
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [locationNameLoading, setLocationNameLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ displayName: string; lat: number; lng: number }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lng: number; id: number } | null>(null);
  const flyToIdRef = useRef(0);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('gh_sound');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });
  const [vibrateEnabled, setVibrateEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('gh_vibrate');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });
  const [submittedToasts, setSubmittedToasts] = useState<Record<string, boolean>>({});
  const toastTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [guessHint, setGuessHint] = useState<string | null>(null);
  const guessHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pan system refs
  const panX = useRef(0);
  const panVelX = useRef(0);
  const panRafId = useRef<number | null>(null);
  const panDragging = useRef(false);
  const panLastX = useRef(0);
  const panLastTime = useRef(0);
  const panInstantVelX = useRef(0);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const yearMin = snapshot.config.yearMin;
  const yearMax = snapshot.config.yearMax;

  const isLocked = busy || hasSubmitted || localSubmitted;
  const canSubmit = !isLocked && guessYear !== null && guessLocation !== null;

  useEffect(() => {
    if (yearEditActive) {
      setYearEditValue(guessYear !== null ? String(guessYear) : "");
    }
  }, [yearEditActive, guessYear]);

  // Cinematic auto-pan on mount
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const startCinematic = () => {
      const max = getMaxPan();
      if (max === 0) return;
      applyPan(-max);
      const DURATION = 5000;
      const startTime = performance.now();
      let rafId: number;
      const animate = (now: number) => {
        if (panDragging.current) return;
        const elapsed = now - startTime;
        const t = Math.min(elapsed / DURATION, 1);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        applyPan(-max + ease * 2 * max);
        if (t < 1) {
          rafId = requestAnimationFrame(animate);
        } else {
          setCinematicDone(true);
        }
      };
      rafId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(rafId);
    };
    if (img.complete && img.naturalWidth > 0) {
      startCinematic();
    } else {
      img.addEventListener('load', startCinematic, { once: true });
    }
  }, []);

  // Auto-open panel when cinematic pan finishes
  useEffect(() => {
    if (cinematicDone) {
      setPanelVisible(true);
    }
  }, [cinematicDone]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (panRafId.current) cancelAnimationFrame(panRafId.current);
      // Clear all toast timeouts
      Object.values(toastTimeoutsRef.current).forEach(clearTimeout);
      if (guessHintTimer.current) clearTimeout(guessHintTimer.current);
    };
  }, []);

  // Reset location name when round changes
  useEffect(() => {
    setLocationName(null);
    setLocationNameLoading(false);
  }, [snapshot.currentRoundIndex]);

  // Persist sound/vibrate settings to localStorage
  useEffect(() => {
    localStorage.setItem('gh_sound', String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem('gh_vibrate', String(vibrateEnabled));
  }, [vibrateEnabled]);

  // Watch for opponent submissions and show toasts
  useEffect(() => {
    if (!snapshot.players || !playerId) return;
    
    snapshot.players.forEach((p) => {
      if (p.hasSubmitted && p.playerId !== playerId && !submittedToasts[p.playerId]) {
        setSubmittedToasts(prev => ({ ...prev, [p.playerId]: true }));
        
        const timeoutId = setTimeout(() => {
          setSubmittedToasts(prev => {
            const next = { ...prev };
            delete next[p.playerId];
            return next;
          });
        }, 3000);
        
        toastTimeoutsRef.current[p.playerId] = timeoutId;
      }
    });
  }, [snapshot.players, playerId, submittedToasts]);

  const handleMapSetLocation = (location: { lat: number; lng: number }) => {
    if (!isLocked) {
      onSetLocation(location);
      reverseGeocode(location.lat, location.lng);
    }
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<void> => {
    setLocationNameLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
        {
          headers: {
            "Accept-Language": "en",
            "User-Agent": "GuessHistory/1.0",
          },
        }
      );
      if (!res.ok) throw new Error("Geocode failed");
      const data = await res.json();
      // Build a short readable name: city + country, or state + country
      const addr = data.address ?? {};
      const primary =
        addr.city ||
        addr.town ||
        addr.village ||
        addr.municipality ||
        addr.county ||
        addr.state_district ||
        addr.state ||
        "";
      const country = addr.country || "";
      const name = primary && country
        ? `${primary}, ${country}`
        : primary || country || data.display_name?.split(",").slice(0, 2).join(",").trim() || "Unknown location";
      setLocationName(name);
    } catch {
      setLocationName(null);
    } finally {
      setLocationNameLoading(false);
    }
  };

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (value.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
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

  const selectSearchResult = (result: { displayName: string; lat: number; lng: number }) => {
    flyToIdRef.current += 1;
    setFlyToTarget({ lat: result.lat, lng: result.lng, id: flyToIdRef.current });
    handleMapSetLocation({ lat: result.lat, lng: result.lng });
    setLocationName(result.displayName);
    setSearchQuery("");
    setSearchResults([]);
    setSearchExpanded(false);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  // Pan system helpers
  const getMaxPan = (): number => {
    const img = imgRef.current;
    const container = imgContainerRef.current;
    if (!img || !container) return 0;
    const containerW = container.clientWidth;
    const naturalW = img.naturalWidth || 1;
    const naturalH = img.naturalHeight || 1;
    const renderedW = (naturalW / naturalH) * container.clientHeight;
    return Math.max(0, (renderedW - containerW) / 2);
  };

  const applyPan = (x: number): number => {
    const max = getMaxPan();
    const clamped = Math.max(-max, Math.min(max, x));
    panX.current = clamped;
    if (imgRef.current) {
      imgRef.current.style.transform = `translateX(calc(-50% + ${clamped}px))`;
    }
    return clamped;
  };

  const startInertia = () => {
    if (panRafId.current) cancelAnimationFrame(panRafId.current);
    const tick = () => {
      panVelX.current *= 0.88;
      if (Math.abs(panVelX.current) < 0.1) {
        panVelX.current = 0;
        return;
      }
      applyPan(panX.current + panVelX.current);
      panRafId.current = requestAnimationFrame(tick);
    };
    panRafId.current = requestAnimationFrame(tick);
  };

  const handlePanStart = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    panDragging.current = true;
    panLastX.current = e.clientX;
    panLastTime.current = e.timeStamp;
    panInstantVelX.current = 0;
    panVelX.current = 0;
    if (panRafId.current) cancelAnimationFrame(panRafId.current);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const handlePanMove = (e: React.PointerEvent) => {
    if (!panDragging.current) return;
    const dx = e.clientX - panLastX.current;
    const dt = e.timeStamp - panLastTime.current;
    panInstantVelX.current = dt > 0 ? (dx / dt) * 16 : 0;
    panLastX.current = e.clientX;
    panLastTime.current = e.timeStamp;
    applyPan(panX.current + dx);
    e.preventDefault();
  };

  const handlePanEnd = () => {
    if (!panDragging.current) return;
    panDragging.current = false;
    panVelX.current = panInstantVelX.current;
    startInertia();
  };

  return (
    <section
      style={{
        height: "100dvh",
        width: "100vw",
        background: "#111",
        overflow: "hidden",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 30,
      }}
    >
      <style>{`
      `}</style>

      {/* IMAGE CONTAINER — full section size, clips overflow */}
      <div
        ref={imgContainerRef}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          touchAction: "none",
          cursor: "grab",
        }}
        onPointerDown={handlePanStart}
        onPointerMove={handlePanMove}
        onPointerUp={handlePanEnd}
        onPointerCancel={handlePanEnd}
      >
        {currentEvent?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={currentEvent.imageUrl}
            alt="Historical event"
            draggable={false}
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              height: "100%",
              width: "auto",
              minWidth: "100%",
              maxWidth: "none",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "#222" }} />
        )}
      </div>

      {timeRemaining !== null && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 15,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            borderRadius: 999,
            padding: "6px 14px",
            fontSize: 14,
            fontWeight: 700,
            color: timeRemaining <= 10 ? "#ef4444" : "#ffffff",
            fontVariantNumeric: "tabular-nums",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          {formatTime(timeRemaining)}
        </div>
      )}

      {snapshot.currentRoundIndex !== undefined && snapshot.config?.totalRounds !== undefined && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            zIndex: 15,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            borderRadius: 999,
            padding: "6px 14px",
            fontSize: 14,
            fontWeight: 700,
            color: "rgba(255,255,255,0.85)",
            fontVariantNumeric: "tabular-nums",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          {snapshot.currentRoundIndex + 1} / {snapshot.config.totalRounds}
        </div>
      )}

        {/* Opponent avatars - fixed top-right */}
      {snapshot.players && snapshot.players.length >= 2 && playerId && (
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 8,
          }}
        >
          {snapshot.players
            .filter((p) => p.playerId !== playerId)
            .map((p) => {
              const initials = (p.displayName ?? p.playerId ?? "?")[0].toUpperCase();
              return (
                <div
                  key={p.playerId}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {submittedToasts[p.playerId] && (
                    <div
                      style={{
                        background: "rgba(0,0,0,0.72)",
                        backdropFilter: "blur(8px)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 20,
                        padding: "4px 10px",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.85)",
                        whiteSpace: "nowrap",
                        animation: "fadeInOut 3s ease forwards",
                      }}
                    >
                      {p.displayName ?? "Player"} guessed
                    </div>
                  )}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      overflow: "hidden",
                      border: p.hasSubmitted
                        ? "2px solid #22c55e"
                        : "2px solid rgba(255,255,255,0.20)",
                      flexShrink: 0,
                      background: "rgba(255,255,255,0.08)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.7)",
                    }}
                  >
                    {p.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.avatarUrl}
                        alt={initials}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      initials
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {mapFullscreen && (
        <div className={styles.mapFullscreenOverlay}>
          <div className={styles.mapFullscreenHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/badges/where.webp" alt="where" style={{ width: 48, height: 48, objectFit: "contain", overflow: "visible", flexShrink: 0 }} />
              <span style={{ fontSize: 16, fontWeight: 700, color: "#22c55e" }}>Where?</span>
            </div>
            <button
              type="button"
              className={styles.mapFullscreenClose}
              onClick={() => setMapFullscreen(false)}
              aria-label="Close fullscreen map"
              style={{ position: 'absolute', top: 16, right: 16, zIndex: 9999, width: 44, height: 44, background: '#22c55e', borderRadius: 12, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className={styles.mapFullscreenBody}>
            <GameMap
              guessLocation={guessLocation}
              onSetLocation={(loc) => { handleMapSetLocation(loc); }}
              flyToTarget={flyToTarget}
              localPlayerAvatarUrl={localPlayerAvatarUrl}
            />
            {guessLocation !== null && (
              <div style={{
                position: "absolute",
                bottom: 16,
                left: 16,
                background: "rgba(0,0,0,0.6)",
                padding: "4px 10px",
                borderRadius: 12,
                fontSize: 18,
                fontWeight: 700,
                color: "#fb923c",
              }}>
                {locationNameLoading
                  ? "…"
                  : locationName
                  ? locationName
                  : "Location set ✓"}
              </div>
            )}
          </div>
        </div>
      )}


      {/* NEW BOTTOM PANEL */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          paddingTop: 80,
          pointerEvents: "none",
          justifyContent: "flex-end",
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 20,
        }}
      >
        {/* COLLAPSED ANSWER SUMMARY — shown only when panel is hidden */}
        {!panelVisible && (guessYear !== null || guessLocation !== null) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: "6px 16px",
              pointerEvents: "auto",
            }}
          >
            {guessLocation !== null && (
              <button
                type="button"
                onClick={() => setPanelVisible(true)}
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  color: "#fff",
                  background: "rgba(34, 197, 94, 0.8)",
                  border: "none",
                  borderRadius: 999,
                  padding: "8px 16px",
                  maxWidth: 180,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/badges/where.webp" alt="where" style={{ width: 28, height: 28, objectFit: "contain", flexShrink: 0 }} /> {locationNameLoading ? "…" : locationName ?? "Location set"}
              </button>
            )}
            {guessYear !== null && (
              <button
                type="button"
                onClick={() => setPanelVisible(true)}
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  color: "#fff",
                  background: "rgba(56, 189, 248, 0.8)",
                  border: "none",
                  borderRadius: 999,
                  padding: "8px 16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/badges/when.webp" alt="when" style={{ width: 28, height: 28, objectFit: "contain", flexShrink: 0 }} /> {guessYear}
              </button>
            )}
          </div>
        )}

        {/* WHERE CARD */}
        {panelVisible && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              background: "rgba(255,255,255,0.10)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.20)",
              borderTop: "1px solid rgba(255,255,255,0.30)",
              borderRadius: "14px",
              padding: "12px 16px 12px",
              marginBottom: "8px",
              pointerEvents: "auto",
            }}
          >
            {/* Header Row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
                backgroundColor: 'rgba(0,0,0,0.55)',
                borderRadius: 10,
                padding: '6px 12px',
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/badges/where.webp" alt="where" style={{ width: 48, height: 48, objectFit: "contain", overflow: "visible", flexShrink: 0 }} />
                <span style={{ fontSize: 15, fontWeight: 600, color: "#22c55e" }}>Where?</span>
              </div>
              {!searchExpanded && (
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => setSearchExpanded(true)}
                    style={{
                      width: "28px",
                      height: "28px",
                      background: "rgba(255,255,255,0.08)",
                      borderRadius: "50%",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="11" cy="11" r="8"/>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => !isLocked && setSearchExpanded(true)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      color: "#22c55e",
                      fontSize: guessLocation !== null ? 18 : 18,
                      fontWeight: 700,
                      cursor: isLocked ? "default" : "pointer",
                      textDecoration: guessLocation === null ? "underline dotted rgba(251,146,60,0.4)" : "none",
                      textUnderlineOffset: "3px",
                      maxWidth: 180,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {guessLocation !== null
                      ? (locationNameLoading ? "…" : locationName ?? "Location set ✓")
                      : "Select a location"}
                  </button>
                </div>
              )}
            </div>

            {/* Search Field - conditional */}
            {searchExpanded && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Search a place (city, country)…"
                    disabled={isLocked}
                    autoFocus={true}
                    onBlur={() => {
                      // Delay collapse so result clicks register first
                      setTimeout(() => {
                        setSearchExpanded(false);
                        setSearchResults([]);
                      }, 200);
                    }}
                    style={{
                      flex: 1,
                      background: "rgba(255,255,255,0.06)",
                      border: "1.5px solid rgba(255,255,255,0.12)",
                      borderRadius: 10,
                      padding: "10px 14px",
                      color: "rgba(255,255,255,0.55)",
                      fontSize: 14,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSearchExpanded(false);
                      setSearchQuery("");
                      setSearchResults([]);
                    }}
                    style={{
                      width: "32px",
                      height: "32px",
                      background: "rgba(255,255,255,0.08)",
                      borderRadius: "50%",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "rgba(255,255,255,0.6)",
                      fontSize: 18,
                      fontWeight: 300,
                    }}
                  >
                    ×
                  </button>
                </div>
                {(searchResults.length > 0 || searchLoading) && (
                  <div style={{
                    background: "#222",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10,
                    marginBottom: 8,
                    overflow: "hidden",
                  }}>
                    {searchLoading && (
                      <div style={{ padding: "10px 14px", fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                        Searching…
                      </div>
                    )}
                    {searchResults.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={() => selectSearchResult(r)}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          background: "transparent",
                          border: "none",
                          borderTop: i > 0 ? "1px solid rgba(255,255,255,0.07)" : "none",
                          color: "rgba(255,255,255,0.85)",
                          fontSize: 13,
                          textAlign: "left",
                          cursor: "pointer",
                          display: "block",
                        }}
                      >
                        {r.displayName}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Map */}
            <div className={styles.mapWrapper} style={{ flex: 1, minHeight: 120 }}>
              <div className={styles.mapNoZoom} style={{ width: "100%", height: "100%" }}>
                <GameMap
                  guessLocation={guessLocation}
                  onSetLocation={handleMapSetLocation}
                  hideZoomControls={true}
                  flyToTarget={flyToTarget}
                  localPlayerAvatarUrl={localPlayerAvatarUrl}
                />
              </div>
              <button
                type="button"
                className={styles.mapFullscreenBtn}
                onClick={() => setMapFullscreen(true)}
                aria-label="Fullscreen map"
                style={{}}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="15 3 21 3 21 9"/>
                  <polyline points="9 21 3 21 3 15"/>
                  <line x1="21" y1="3" x2="14" y2="10"/>
                  <line x1="3" y1="21" x2="10" y2="14"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* WHEN CARD */}
        {panelVisible && (
          <div
            style={{
              background: "rgba(255,255,255,0.10)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.20)",
              borderTop: "1px solid rgba(255,255,255,0.30)",
              borderRadius: "14px",
              padding: "12px 16px",
              pointerEvents: "auto",
            }}
          >
            {/* Header Row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
                backgroundColor: 'rgba(0,0,0,0.55)',
                borderRadius: 10,
                padding: '6px 12px',
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/badges/when.webp" alt="when" style={{ width: 48, height: 48, objectFit: "contain", overflow: "visible", flexShrink: 0 }} />
                <span style={{ fontSize: 15, fontWeight: 600, color: "#38bdf8" }}>When?</span>
              </div>
              {!yearEditActive ? (
                <button
                  type="button"
                  onClick={() => {
                    if (isLocked) return;
                    setYearEditValue(guessYear !== null ? String(guessYear) : "");
                    setYearEditActive(true);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "#38bdf8",
                    fontSize: 18,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    cursor: isLocked ? "default" : "pointer",
                    textDecoration: "underline dotted rgba(251,146,60,0.4)",
                    textUnderlineOffset: "3px",
                  }}
                >
                  {guessYear !== null ? String(guessYear) : "Select a year"}
                </button>
              ) : (
                <input
                  type="number"
                  value={yearEditValue}
                  onChange={(e) => setYearEditValue(e.target.value)}
                  onBlur={() => {
                    const parsed = parseInt(yearEditValue, 10);
                    if (!isNaN(parsed)) {
                      const clamped = Math.max(yearMin, Math.min(yearMax, parsed));
                      onSetYear(clamped);
                      guessYearRef.current = clamped;
                    }
                    setYearEditActive(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const parsed = parseInt(yearEditValue, 10);
                      if (!isNaN(parsed)) {
                        const clamped = Math.max(yearMin, Math.min(yearMax, parsed));
                        onSetYear(clamped);
                        guessYearRef.current = clamped;
                      }
                      setYearEditActive(false);
                    }
                  }}
                  onFocus={(e) => {
                    // Slight delay ensures the selection happens after browser default focus behavior
                    setTimeout(() => e.target.select(), 10);
                  }}
                  autoFocus={true}
                  min={yearMin}
                  max={yearMax}
                  style={{
                    width: "80px",
                    height: "32px",
                    background: "rgba(255,255,255,0.10)",
                    border: "1.5px solid #fb923c",
                    borderRadius: 8,
                    color: "#38bdf8",
                    fontSize: 18,
                    fontWeight: 700,
                    textAlign: "center",
                    outline: "none",
                    padding: "0 4px",
                    MozAppearance: "textfield",
                    WebkitAppearance: "none",
                  } as React.CSSProperties}
                />
              )}
            </div>

            {/* Year Picker */}
            <div style={{ backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12, padding: '8px 0' }}>
              <YearPicker
                value={guessYear ?? Math.round((yearMin + yearMax) / 2)}
                onChange={(year) => {
                  onSetYear(year);
                  guessYearRef.current = year;
                }}
                min={yearMin}
                max={yearMax}
                defaultScale="century"
                valueIsCommitted={guessYear !== null}
                className="w-full"
              />
            </div>
          </div>
        )}

        {guessHint && (
          <div style={{
            textAlign: "center",
            fontSize: 13,
            fontWeight: 600,
            color: "#fb923c",
            padding: "4px 0 2px",
          }}>
            {guessHint}
          </div>
        )}

        {/* NAVBAR */}
        <div className={styles.navbar}>
          {/* Left Column: Settings and Hints */}
          <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
            {/* Settings */}
            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              style={{
                width: 44, height: 44,
                background: "rgba(255,255,255,0.18)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.20)",
                cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}
              aria-label="Settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </button>

            {/* Hints — positioned midway using flex center in remaining space */}
            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <button
                type="button"
                onClick={onOpenHints}
                disabled={isLocked}
                style={{
                  width: 110,
                  height: 44,
                  background: "linear-gradient(135deg, #a8edbc, #7dd8f0, #c4b5f7)",
                  border: "none",
                  borderRadius: "8px",
                  cursor: isLocked ? "not-allowed" : "pointer",
                  opacity: isLocked ? 0.4 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 12px",
                }}
                aria-label="Hints"
              >
                <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>
                  Hints
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>
                  {hintsUsedCount ?? 0}/{hintsTotalCount ?? 14}
                </span>
              </button>
            </div>
          </div>

          {/* Center Column: Show/Hide Toggle */}
          <button
            type="button"
            onClick={() => setPanelVisible(!panelVisible)}
            className={!panelVisible && !canSubmit ? styles.shineBtn : undefined}
            style={{
              width: 56,
              height: 56,
              background: "linear-gradient(135deg, #c084fc, #fb923c)",
              borderRadius: "50%",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2,
            }}
            aria-label={panelVisible ? "Hide panel" : "Show panel"}
          >
            {panelVisible ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            )}
          </button>

          {/* Right Column: Make Guess */}
          <button
            type="button"
            onClick={() => {
              if (!canSubmit) {
                const missing: string[] = [];
                if (guessLocation === null) missing.push("a location");
                if (guessYear === null) missing.push("a year");
                setGuessHint("Select " + missing.join(" and ") + " first");
                if (guessHintTimer.current) clearTimeout(guessHintTimer.current);
                guessHintTimer.current = setTimeout(() => setGuessHint(null), 2500);
                return;
              }
              onSubmit();
            }}
            className={canSubmit ? styles.shineBtn : undefined}
            style={{
              width: "100%",
              minWidth: 0,
              height: 48,
              borderRadius: 999,
              border: "none",
              background: busy || hasSubmitted || localSubmitted
                ? "rgba(255,255,255,0.25)"
                : canSubmit
                ? "linear-gradient(135deg, #ff8a00, #ffae42)"
                : "rgba(255,255,255,0.25)",
              color: busy || hasSubmitted || localSubmitted
                ? "rgba(255,255,255,0.85)"
                : canSubmit
                ? "#17110a"
                : "rgba(255,255,255,0.85)",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              padding: "0 16px",
            }}
          >
            {!busy && !hasSubmitted && !localSubmitted && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            )}
            {busy ? "Submitting…" : hasSubmitted || localSubmitted ? "Submitted ✓" : "Make Guess"}
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      {settingsModalOpen && (
        <div
          onClick={() => setSettingsModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1a1714',
              borderRadius: 16,
              padding: 24,
              width: '90%',
              maxWidth: 320,
              position: 'relative',
            }}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setSettingsModalOpen(false)}
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.6)',
                fontSize: 24,
                cursor: 'pointer',
                padding: 4,
                lineHeight: 1,
              }}
            >
              ×
            </button>

            {/* Row 1: Sound toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <span style={{ color: 'white', fontSize: 15 }}>Sound</span>
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                style={{
                  width: 48,
                  height: 28,
                  borderRadius: 14,
                  border: 'none',
                  background: soundEnabled ? '#fb923c' : 'rgba(255,255,255,0.2)',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: soundEnabled ? 24 : 2,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'white',
                    transition: 'left 0.2s',
                  }}
                />
              </button>
            </div>

            {/* Row 2: Vibrate toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <span style={{ color: 'white', fontSize: 15 }}>Vibrate</span>
              <button
                type="button"
                onClick={() => setVibrateEnabled(!vibrateEnabled)}
                style={{
                  width: 48,
                  height: 28,
                  borderRadius: 14,
                  border: 'none',
                  background: vibrateEnabled ? '#fb923c' : 'rgba(255,255,255,0.2)',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: vibrateEnabled ? 24 : 2,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'white',
                    transition: 'left 0.2s',
                  }}
                />
              </button>
            </div>

            {/* Row 3: Home button */}
            <button
              type="button"
              onClick={() => window.location.href = '/'}
              style={{
                width: '100%',
                height: 44,
                borderRadius: 999,
                border: 'none',
                background: 'rgba(255,255,255,0.1)',
                color: 'white',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Home
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
