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
  hintsUsedCount,
  localPlayerAvatarUrl,
}: RoundActiveSectionProps) {
  const currentEvent = snapshot.rounds?.[snapshot.currentRoundIndex];
  const guessLocation =
    guessLat !== null && guessLng !== null
      ? { lat: guessLat, lng: guessLng }
      : null;

  const [activePanel, setActivePanel] = useState<'where' | 'when' | null>(null);
  const [cinematicDone, setCinematicDone] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
    // Cinematic done — do not auto-open any panel
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

  // Timer urgency effects: flash, vibrate, tick sound when <= 10s
  const lastTickSecRef = useRef<number>(-1);
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0 || timeRemaining > 10) {
      lastTickSecRef.current = -1;
      return;
    }
    if (timeRemaining === lastTickSecRef.current) return;
    lastTickSecRef.current = timeRemaining;

    // Vibrate (50ms pulse, mobile only)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40);
    }

    // Tick sound (short 880Hz beep via Web Audio API)
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = timeRemaining <= 3 ? 1100 : 880;
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
      osc.onended = () => ctx.close();
    } catch { /* audio not available */ }
  }, [timeRemaining]);

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
        }, 2000);
        
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
    <section className={styles.section}>

      {/* IMAGE CONTAINER */}
      <div
        ref={imgContainerRef}
        className={styles.imgContainer}
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
            className={styles.eventImg}
          />
        ) : (
          <div className={styles.imgPlaceholder} />
        )}
      </div>

      {/* TIMER */}
      {timeRemaining !== null && snapshot.config?.roundTimerSec !== 0 && (() => {
        const totalSec: number = (snapshot.config as { roundTimerSec?: number }).roundTimerSec || 120;
        const radius = 26;
        const circumference = 2 * Math.PI * radius;
        const progress = Math.max(0, Math.min(1, timeRemaining / totalSec));
        const strokeDashoffset = circumference * (1 - progress);
        const isUrgent = timeRemaining <= 10;
        const ringColor = isUrgent ? "#ef4444" : timeRemaining <= 30 ? "#f97316" : "#22c55e";
        return (
          <div className={`${styles.timerWrapper} ${isUrgent ? styles.timerUrgent : ""}`}>
            <svg
              width="72"
              height="72"
              viewBox="0 0 72 72"
              className={styles.timerSvg}
            >
              <circle
                cx="36" cy="36" r={radius}
                fill="rgba(0,0,0,0.55)"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="3"
              />
              <circle
                cx="36" cy="36" r={radius}
                fill="none"
                stroke={ringColor}
                strokeWidth="3"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className={styles.timerArc}
              />
            </svg>
            <span className={`${styles.timerText} ${isUrgent ? styles.timerTextUrgent : ""}`}>
              {formatTime(timeRemaining)}
            </span>
          </div>
        );
      })()}

      {/* ROUND PILL */}
      {snapshot.currentRoundIndex !== undefined && snapshot.config?.totalRounds !== undefined && (
        <div className={styles.roundPill}>
          <button
            type="button"
            onClick={() => setSettingsModalOpen(true)}
            className={styles.settingsBtn}
            aria-label="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
          <span>{snapshot.currentRoundIndex + 1} / {snapshot.config.totalRounds}</span>
        </div>
      )}

      {/* OPPONENT AVATARS */}
      {snapshot.players && snapshot.players.length >= 2 && playerId && (
        <div className={styles.opponentList}>
          {snapshot.players
            .filter((p) => p.playerId !== playerId)
            .map((p) => {
              const initials = (p.displayName ?? p.playerId ?? "?")[0].toUpperCase();
              return (
                <div key={p.playerId} className={styles.opponentRow}>
                  {submittedToasts[p.playerId] && (
                    <div className={styles.submittedToast}>Guessed</div>
                  )}
                  <div className={`${styles.opponentAvatar} ${p.hasSubmitted ? styles.opponentAvatarSubmitted : ""}`}>
                    {p.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.avatarUrl}
                        alt={initials}
                        className={styles.opponentAvatarImg}
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

      {/* FULLSCREEN MAP OVERLAY */}
      {mapFullscreen && (
        <div className={styles.mapFullscreenOverlay}>
          <div className={styles.mapFullscreenBody}>
            <GameMap
              guessLocation={guessLocation}
              onSetLocation={(loc) => { handleMapSetLocation(loc); }}
              flyToTarget={flyToTarget}
              localPlayerAvatarUrl={localPlayerAvatarUrl}
            />
            {guessLocation !== null && (
              <div className={styles.mapLocationLabel}>
                {locationNameLoading ? "…" : locationName ? locationName : "Location set ✓"}
              </div>
            )}
            <button
              type="button"
              onClick={() => setMapFullscreen(false)}
              className={styles.mapCloseBtn}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM PANEL */}
      <div className={styles.bottomPanel}>
        {activePanel !== null && (
          <div className={styles.panelDismiss} onClick={() => setActivePanel(null)} />
        )}

        {/* WHERE PANEL */}
        {activePanel === 'where' && (
          <div className={styles.wherePanel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitleGroup}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/badges/where.webp" alt="where" className={styles.panelIcon} />
                <div className={styles.panelMeta}>
                  <span className={styles.panelLabelWhere}>WHERE</span>
                  <span className={styles.panelValue}>
                    {guessLocation !== null
                      ? (locationNameLoading ? "…" : locationName ?? "Location set ✓")
                      : "No location set"}
                  </span>
                </div>
              </div>
            </div>

            <div className={`${styles.mapWrapper} ${styles.mapWrapperFlex}`}>
              <div className={`${styles.mapNoZoom} ${styles.mapNoZoomInner}`}>
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
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="15 3 21 3 21 9"/>
                  <polyline points="9 21 3 21 3 15"/>
                  <line x1="21" y1="3" x2="14" y2="10"/>
                  <line x1="3" y1="21" x2="10" y2="14"/>
                </svg>
              </button>
            </div>

            {!isLocked && (
              <div className={styles.searchWrap}>
                <div className={styles.searchRow}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Search a place (city, country)…"
                    disabled={isLocked}
                    className={styles.searchInput}
                  />
                </div>
                {(searchResults.length > 0 || searchLoading) && (
                  <div className={styles.searchDropdown}>
                    {searchLoading && (
                      <div className={styles.searchLoading}>Searching…</div>
                    )}
                    {searchResults.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={() => selectSearchResult(r)}
                        className={`${styles.searchResultBtn} ${i > 0 ? styles.searchResultBtnBorder : ""}`}
                      >
                        {r.displayName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* WHEN PANEL */}
        {activePanel === 'when' && (
          <div className={styles.whenPanel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitleGroup}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/badges/when.webp" alt="when" className={styles.panelIcon} />
                <div className={styles.panelMeta}>
                  <span className={styles.panelLabelWhen}>WHEN</span>
                  <span className={styles.panelValueNumeric}>
                    {guessYear !== null ? String(guessYear) : "No year set"}
                  </span>
                </div>
              </div>
            </div>

            <div>
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

            {!isLocked && (
              <div className={styles.yearInputWrap}>
                <input
                  type="number"
                  value={yearEditValue}
                  onChange={(e) => {
                    setYearEditValue(e.target.value);
                    const parsed = parseInt(e.target.value, 10);
                    if (!isNaN(parsed)) {
                      const clamped = Math.max(yearMin, Math.min(yearMax, parsed));
                      onSetYear(clamped);
                      guessYearRef.current = clamped;
                    }
                  }}
                  onFocus={(e) => {
                    setYearEditValue(guessYear !== null ? String(guessYear) : "");
                    setTimeout(() => e.target.select(), 10);
                  }}
                  placeholder={`Enter year (${yearMin}–${yearMax})`}
                  min={yearMin}
                  max={yearMax}
                  className={styles.yearInput}
                />
              </div>
            )}
          </div>
        )}

        {/* GUESS HINT */}
        {guessHint && (
          <div className={styles.guessHint}>{guessHint}</div>
        )}

        {/* NAVBAR */}
        <div className={styles.navbar}>

          {/* Hints button */}
          <button
            type="button"
            onClick={onOpenHints}
            disabled={isLocked}
            className={`${styles.hintsBtn} ${isLocked ? styles.hintsBtnLocked : ""}`}
            aria-label="Hints"
          >
            <span className={styles.hintsCount}>{hintsUsedCount ?? 0}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.663 17h4.673M12 3v1m0 16v1M4.22 4.22l.707.707M19.778 19.778l-.707-.707M3 12h1m16 0h1M4.22 19.778l.707-.707M19.778 4.22l-.707.707M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/>
            </svg>
          </button>

          {/* WHERE circle with overlay tag */}
          <div className={styles.navBtnCircleWrap}>
            <span className={`${styles.navBtnOverlayTag} ${styles.navBtnOverlayTagWhere} ${guessLocation !== null ? styles.navBtnOverlayTagAnswer : ""}`}>
              {guessLocation !== null
                ? (locationNameLoading ? "…" : (locationName ?? "✓").split(",")[0].trim())
                : "WHERE"}
            </span>
            <button
              type="button"
              onClick={() => setActivePanel(prev => prev === 'where' ? null : 'where')}
              className={`${styles.whereBtn} ${
                activePanel === 'where'
                  ? styles.whereBtnActive
                  : guessLocation === null && !isLocked
                  ? styles.whereBtnUnanswered
                  : ""
              }`}
              aria-label="Where"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z"/>
                <circle cx="12" cy="10" r="2.5"/>
              </svg>
            </button>
          </div>

          {/* WHEN circle with overlay tag */}
          <div className={styles.navBtnCircleWrap}>
            <span className={`${styles.navBtnOverlayTag} ${styles.navBtnOverlayTagWhen} ${guessYear !== null ? styles.navBtnOverlayTagAnswer : ""}`}>
              {guessYear !== null ? String(guessYear) : "WHEN"}
            </span>
            <button
              type="button"
              onClick={() => setActivePanel(prev => prev === 'when' ? null : 'when')}
              className={`${styles.whenBtn} ${
                activePanel === 'when'
                  ? styles.whenBtnActive
                  : guessYear === null && !isLocked
                  ? styles.whenBtnUnanswered
                  : ""
              }`}
              aria-label="When"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="5" width="16" height="15" rx="2"/>
                <path d="M8 3v4M16 3v4M4 10h16"/>
              </svg>
            </button>
          </div>

          {/* Submit button */}
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
            className={`${styles.submitBtn} ${
              busy || hasSubmitted || localSubmitted
                ? styles.submitBtnSubmitted
                : canSubmit
                ? `${styles.submitBtnReady} ${styles.submitActive}` 
                : ""
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            <span>{busy ? "…" : hasSubmitted || localSubmitted ? "✓" : "Go"}</span>
          </button>

        </div>
      </div>

      {/* SETTINGS MODAL */}
      {settingsModalOpen && (
        <div className={styles.settingsOverlay} onClick={() => setSettingsModalOpen(false)}>
          <button
            type="button"
            onClick={() => setSettingsModalOpen(false)}
            className={styles.settingsCloseBtn}
          >
            <svg viewBox="0 0 10 10" fill="none" width="12" height="12">
              <path d="M2 2l6 6M8 2L2 8" stroke="#333" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>

          <div className={styles.settingsCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.settingsTitle}>Settings</div>

            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>Sound</span>
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={styles.toggle}
                style={{
                  "--toggle-bg": soundEnabled ? "var(--gh-orange)" : "rgba(0,0,0,0.15)",
                  "--toggle-left": soundEnabled ? "22px" : "2px",
                } as React.CSSProperties}
              >
                <div className={styles.toggleKnob} />
              </button>
            </div>

            <div className={styles.settingsRowLast}>
              <span className={styles.settingsLabel}>Vibrate</span>
              <button
                type="button"
                onClick={() => setVibrateEnabled(!vibrateEnabled)}
                className={styles.toggle}
                style={{
                  "--toggle-bg": vibrateEnabled ? "var(--gh-orange)" : "rgba(0,0,0,0.15)",
                  "--toggle-left": vibrateEnabled ? "22px" : "2px",
                } as React.CSSProperties}
              >
                <div className={styles.toggleKnob} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => window.location.href = '/'}
              className={styles.settingsHomeBtn}
            >
              Home
            </button>
          </div>
        </div>
      )}

    </section>
  );
}
