"use client";

import type { CompeteSessionSnapshot, SessionPlayer } from "@/core/types";
import dynamic from "next/dynamic";
import { useState, useRef, useEffect } from "react";
import { useTranslations } from 'next-intl';
import { YearPicker } from "@/components/YearPicker";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
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
  const t = useTranslations();
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

  // Sheet state
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [sheetDrag, setSheetDrag] = useState(0);
  const sheetDragStartY = useRef<number | null>(null);
  const sheetRawDy = useRef(0);

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

  const closeSheet = () => {
    setActivePanel(null);
    setSheetExpanded(false);
    setSheetDrag(0);
    sheetDragStartY.current = null;
    setSearchQuery("");
    setSearchResults([]);
  };

  const onSheetHandleDown = (e: React.PointerEvent) => {
    sheetDragStartY.current = e.clientY;
    sheetRawDy.current = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onSheetHandleMove = (e: React.PointerEvent) => {
    if (sheetDragStartY.current === null) return;
    const dy = e.clientY - sheetDragStartY.current;
    sheetRawDy.current = dy;
    setSheetDrag(Math.max(0, dy));
  };

  const onSheetHandleUp = () => {
    if (sheetDragStartY.current === null) return;
    const dy = sheetRawDy.current;
    const canExpand = activePanel === "where";

    if (canExpand && !sheetExpanded && dy < -70) {
      setSheetExpanded(true);
    } else if (canExpand && sheetExpanded && dy > 120) {
      setSheetExpanded(false);
    } else if (!sheetExpanded && dy > 140) {
      closeSheet();
    }
    sheetDragStartY.current = null;
    sheetRawDy.current = 0;
    setSheetDrag(0);
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
        {/* GUESS HINT */}
        {guessHint && (
          <div className={styles.guessHint}>{guessHint}</div>
        )}

        {/* NAVBAR */}
        <div className={styles.navbar}>

          {/* Hints */}
          <button
            type="button"
            onClick={onOpenHints}
            disabled={isLocked}
            className={`${styles.circleBtn} ${styles.hintsBtn} ${isLocked ? styles.hintsBtnLocked : ""}`}
            aria-label="Hints"
          >
            <span className={styles.hintsCount}>{hintsUsedCount ?? 0}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.663 17h4.673M12 3v1m0 16v1M4.22 4.22l.707.707M19.778 19.778l-.707-.707M3 12h1m16 0h1M4.22 19.778l.707-.707M19.778 4.22l-.707.707M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z" />
            </svg>
          </button>

          {/* WHEN — left of WHERE */}
          <div className={styles.circleWrap}>
            <span className={`${styles.overlayTag} ${styles.overlayTagWhen} ${guessYear !== null ? styles.overlayTagAnswer : ""}`}>
              {guessYear !== null ? String(guessYear) : t('game.when')}
            </span>
            <button
              type="button"
              onClick={() => {
                if (activePanel === 'when') {
                  closeSheet();
                } else {
                  setActivePanel('when');
                  setSheetExpanded(false);
                  setSheetDrag(0);
                }
              }}
              disabled={isLocked}
              className={`${styles.circleBtn} ${styles.whenBtn} ${
                activePanel === 'when'
                  ? styles.btnActive
                  : guessYear === null && !isLocked
                  ? styles.whenBtnGlow
                  : ""
              }`}
              aria-label="When"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/badges/when.webp" alt="When" className={styles.btnIcon} />
            </button>
          </div>

          {/* WHERE — right of WHEN */}
          <div className={styles.circleWrap}>
            <span className={`${styles.overlayTag} ${styles.overlayTagWhere} ${guessLocation !== null ? styles.overlayTagWhereAnswer : ""}`}>
              {guessLocation !== null
                ? (locationNameLoading ? "…" : (locationName ?? "✓").split(",")[0].trim())
                : t('game.where')}
            </span>
            <button
              type="button"
              onClick={() => {
                if (activePanel === 'where') {
                  closeSheet();
                } else {
                  setActivePanel('where');
                  setSheetExpanded(false);
                  setSheetDrag(0);
                }
              }}
              disabled={isLocked}
              className={`${styles.circleBtn} ${styles.whereBtn} ${
                activePanel === 'where'
                  ? styles.btnActive
                  : guessLocation === null && !isLocked
                  ? styles.whereBtnGlow
                  : ""
              }`}
              aria-label="Where"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/badges/where.webp" alt="Where" className={styles.btnIcon} />
            </button>
          </div>

          {/* Submit */}
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
            className={`${styles.circleBtn} ${styles.submitBtn} ${
              busy || hasSubmitted || localSubmitted
                ? styles.submitBtnSubmitted
                : canSubmit
                ? styles.submitBtnReady
                : ""
            }`}
            aria-label="Submit"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>

        </div>
      </div>

      {/* ════ BOTTOM SHEET ════ */}
      {activePanel !== null && (
        <>
          <div className={styles.sheetBackdrop} onClick={closeSheet} />
          <div
            className={`${styles.sheet} ${activePanel === 'where' && sheetExpanded ? styles.sheetFull : ""}`}
            style={{ "--sheet-drag": `${sheetDrag}px` } as React.CSSProperties}
          >
            {/* Drag handle — only element that controls sheet drag */}
            <div
              className={styles.dragZone}
              onPointerDown={onSheetHandleDown}
              onPointerMove={onSheetHandleMove}
              onPointerUp={onSheetHandleUp}
              onPointerCancel={onSheetHandleUp}
            >
              <div className={styles.dragHandle} />
            </div>

            {/* WHERE sheet */}
            {activePanel === 'where' && (
              <>
                <div className={styles.sheetHeader}>
                  <div className={styles.sheetHeaderLeft}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/badges/where.webp" alt="" className={styles.sheetHeaderIcon} />
                    <div className={styles.sheetHeaderMeta}>
                      <span className={styles.sheetHeaderValue}>
                        {guessLocation !== null
                          ? (locationNameLoading ? "…" : locationName ?? "Location set ✓")
                          : "No location set"}
                      </span>
                    </div>
                  </div>
                  <button type="button" className={styles.sheetCloseBtn} onClick={closeSheet} aria-label="Close">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <div className={styles.sheetMap}>
                  <GameMap
                    guessLocation={guessLocation}
                    onSetLocation={handleMapSetLocation}
                    hideZoomControls={true}
                    flyToTarget={flyToTarget}
                    localPlayerAvatarUrl={localPlayerAvatarUrl}
                  />
                </div>

                {!isLocked && (
                  <div className={styles.sheetFieldWrap}>
                    <svg className={styles.sheetFieldIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="11" cy="11" r="7" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder="Search a place (city, country)…"
                      disabled={isLocked}
                      className={`${styles.sheetField} ${styles.sheetFieldWithIcon}`}
                    />
                    {(searchResults.length > 0 || searchLoading) && (
                      <div className={styles.sheetSearchDropdown}>
                        {searchLoading && <div className={styles.sheetSearchLoading}>Searching…</div>}
                        {searchResults.map((r, i) => (
                          <button
                            key={i}
                            type="button"
                            onMouseDown={() => selectSearchResult(r)}
                            className={`${styles.sheetSearchResultBtn} ${i > 0 ? styles.sheetSearchResultBorder : ""}`}
                          >
                            {r.displayName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  className={`${styles.sheetConfirmBtn} ${styles.sheetConfirmWhere} ${guessLocation !== null ? styles.sheetConfirmReady : ""}`}
                  onClick={closeSheet}
                  disabled={guessLocation === null}
                >
                  {guessLocation !== null ? "Confirm location" : "Tap the map to set a location"}
                </button>
              </>
            )}

            {/* WHEN sheet */}
            {activePanel === 'when' && (
              <>
                <div className={styles.sheetHeader}>
                  <div className={styles.sheetHeaderLeft}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/badges/when.webp" alt="" className={styles.sheetHeaderIcon} />
                    <div className={styles.sheetHeaderMeta}>
                      <span className={styles.sheetHeaderValue}>
                        {guessYear !== null ? String(guessYear) : "No year set"}
                      </span>
                    </div>
                  </div>
                  <button type="button" className={styles.sheetCloseBtn} onClick={closeSheet} aria-label="Close">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <div className={styles.sheetPickerWrap}>
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
                  <div className={styles.sheetFieldWrap}>
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
                      className={styles.sheetField}
                    />
                  </div>
                )}

                <button
                  type="button"
                  className={`${styles.sheetConfirmBtn} ${styles.sheetConfirmWhen} ${guessYear !== null ? styles.sheetConfirmReady : ""}`}
                  onClick={closeSheet}
                  disabled={guessYear === null}
                >
                  {guessYear !== null ? "Confirm year" : "Pick a year to continue"}
                </button>
              </>
            )}
          </div>
        </>
      )}

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
            <div className={styles.settingsTitle}>{t('game.settings')}</div>

            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>{t('game.sound')}</span>
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
              <span className={styles.settingsLabel}>{t('game.vibrate')}</span>
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

            <div style={{ marginTop: '4px', paddingTop: '16px', borderTop: '0.5px solid rgba(0,0,0,0.1)' }}>
              <div style={{ fontSize: '13px', color: '#555', marginBottom: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('nav.language')}</div>
              <LanguageSwitcher initialLocale={
                (typeof document !== 'undefined'
                  ? document.cookie.split(';').find(c => c.trim().startsWith('gh_locale='))?.split('=')[1]
                  : undefined) ?? 'en'
              } />
            </div>

            <button
              type="button"
              onClick={() => window.location.href = '/'}
              className={styles.settingsHomeBtn}
            >
              {t('nav.home')}
            </button>
          </div>
        </div>
      )}

    </section>
  );
}
