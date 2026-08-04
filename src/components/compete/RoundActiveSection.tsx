"use client";

import type { CompeteSessionSnapshot, SessionPlayer } from "@/core/types";
import dynamic from "next/dynamic";
import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from 'next-intl';
import { getDistanceUnitPreference, setDistanceUnitPreference, type DistanceUnit } from "@/lib/distance";
import { YearPicker } from "@/components/YearPicker";
import NotificationBell from "@/components/NotificationBell";
import { setLocale } from "@/actions/setLocale";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { LanguageDropdown } from "@/components/layout/LanguageDropdown";
import AccuracySuffix from "@/components/AccuracySuffix";
import { getAccuracyColor } from "@/core/accuracyColor";
import PlayerAvatar from "./PlayerAvatar";
import WhereIcon from "@/components/icons/WhereIcon";
import WhenIcon from "@/components/icons/WhenIcon";
import styles from "./RoundActiveSection.module.css";
import type { ConnectionState } from "@/core/competeWebSocket";

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
  connectionState?: ConnectionState;
  onSetLocation: (location: { lat: number; lng: number }) => void;
  onSetYear: (year: number | null) => void;
  onSubmit: () => void;
  onOpenHints: () => void;
  guessYearRef: React.MutableRefObject<number | null>;
  viewer: SessionPlayer | null;
  timeRemaining: number | null;
  hintsUsedCount?: number;
  localPlayerAvatarUrl?: string | null;
  locationName: string | null;
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
  connectionState,
  onSetLocation,
  onSetYear,
  onSubmit,
  onOpenHints,
  guessYearRef,
  timeRemaining,
  hintsUsedCount,
  localPlayerAvatarUrl,
  locationName,
}: RoundActiveSectionProps) {
  void connectionState;
  const t = useTranslations('game');
  const tNav = useTranslations('nav');
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
  const [searchResults, setSearchResults] = useState<Array<{ displayName: string; lat: number; lng: number }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lng: number; id: number } | null>(null);
  const flyToIdRef = useRef(0);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [homeNavigating, setHomeNavigating] = useState(false);
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
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(() => getDistanceUnitPreference());
  const [submittedToasts, setSubmittedToasts] = useState<Record<string, boolean>>({});
  const toastTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [guessHint, setGuessHint] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [imgRetryKey, setImgRetryKey] = useState(0);
  const guessHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const whereSearchInputRef = useRef<HTMLInputElement>(null);
  const yearEditInputRef = useRef<HTMLInputElement>(null);
  const [sheetViewportStyle, setSheetViewportStyle] = useState<React.CSSProperties>({});
  const [localePending, startLocaleTransition] = useTransition();
  // Running total accuracy across completed rounds of the current game (viewer).
  // Source of truth: round_results table via /all-results endpoint (DB-backed).
  // Formula mirrors server session-accuracy: avg of (location_score + time_score) / 2.
  const [runningAccuracy, setRunningAccuracy] = useState<number | null>(null);

  // Pan + zoom system refs
  const panX = useRef(0);
  const panY = useRef(0);
  const scale = useRef(1);
  const panVelX = useRef(0);
  const panRafId = useRef<number | null>(null);
  const panDragging = useRef(false);
  const panLastX = useRef(0);
  const panLastY = useRef(0);
  const panLastTime = useRef(0);
  const panInstantVelX = useRef(0);
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchPrevDist = useRef<number | null>(null);
  const gestureMoved = useRef(0);
  const lastTapTime = useRef(0);
  const lastTapX = useRef(0);
  const lastTapY = useRef(0);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const yearMin = snapshot.config.yearMin;
  const yearMax = snapshot.config.yearMax;

  // Pan + zoom helpers
  const getMaxPan = useCallback((): { maxX: number; maxY: number } => {
    const img = imgRef.current;
    const container = imgContainerRef.current;
    if (!img || !container) return { maxX: 0, maxY: 0 };
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const naturalW = img.naturalWidth || 1;
    const naturalH = img.naturalHeight || 1;
    const renderedW = (naturalW / naturalH) * containerH;
    const s = scale.current;
    return {
      maxX: Math.max(0, (renderedW * s - containerW) / 2),
      maxY: Math.max(0, (containerH * s - containerH) / 2),
    };
  }, []);

  const applyTransform = useCallback(() => {
    const { maxX, maxY } = getMaxPan();
    panX.current = Math.max(-maxX, Math.min(maxX, panX.current));
    panY.current = Math.max(-maxY, Math.min(maxY, panY.current));
    if (imgRef.current) {
      imgRef.current.style.transform =
        `translate(calc(-50% + ${panX.current}px), ${panY.current}px) scale(${scale.current})`;
    }
  }, [getMaxPan]);

  const applyPan = useCallback((x: number): number => {
    panX.current = x;
    applyTransform();
    return panX.current;
  }, [applyTransform]);

  const isLocked = busy || hasSubmitted || localSubmitted;
  const canSubmit = !isLocked && guessYear !== null && guessLocation !== null;

  // Cinematic auto-pan on mount
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const startCinematic = () => {
      const { maxX: max } = getMaxPan();
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
  }, [applyPan, getMaxPan]);

  // Auto-open panel when cinematic pan finishes
  useEffect(() => {
    // Cinematic done — do not auto-open any panel
  }, [cinematicDone]);

  // Reset image error state when the round image URL changes
  useEffect(() => {
    setImgError(false);
  }, [currentEvent?.imageUrl]);

  // Auto-focus the relevant input field when a panel opens
  useEffect(() => {
    if (activePanel === null) return;
    const id = window.setTimeout(() => {
      if (activePanel === 'where') {
        whereSearchInputRef.current?.focus();
      } else if (activePanel === 'when') {
        yearEditInputRef.current?.focus();
      }
    }, 120);
    return () => window.clearTimeout(id);
  }, [activePanel]);

  // Constrain sheet to the visual viewport so the confirm button (both
  // sheets) and the header (WHEN sheet) stay visible above the mobile
  // soft keyboard.  dvh alone is unreliable on iOS Safari — the layout
  // viewport does not shrink when the keyboard appears, so a sheet
  // anchored to bottom:0 is partially hidden behind it.  The VisualViewport
  // API reports the actual visible area, letting us pin the sheet inside it.
  useEffect(() => {
    if (activePanel === null) {
      setSheetViewportStyle({});
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const keyboardOpen = vv.height < window.innerHeight - 10;
      if (keyboardOpen) {
        setSheetViewportStyle({
          position: 'fixed',
          top: `${vv.offsetTop}px`,
          height: `${vv.height}px`,
          maxHeight: `${vv.height}px`,
          transition: 'none',
        });
      } else {
        setSheetViewportStyle({});
      }
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [activePanel]);

  // Cleanup on unmount
  useEffect(() => {
    const timeouts = toastTimeoutsRef.current;
    return () => {
      if (panRafId.current) cancelAnimationFrame(panRafId.current);
      // Clear all toast timeouts
      Object.values(timeouts).forEach(clearTimeout);
      if (guessHintTimer.current) clearTimeout(guessHintTimer.current);
    };
  }, []);

  // Fetch running total accuracy across completed rounds during ROUND_ACTIVE.
  // DB = source of truth (round_results). No client fabrication.
  useEffect(() => {
    if (snapshot.status !== "ROUND_ACTIVE") return;
    const currentRoundIndex = snapshot.currentRoundIndex;
    if (typeof currentRoundIndex !== "number" || currentRoundIndex <= 0) {
      setRunningAccuracy(null);
      return;
    }
    if (!snapshot.gameId || !playerId) {
      setRunningAccuracy(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/compete/${snapshot.gameId}/all-results?playerId=${playerId}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const rows: Array<{ playerId: string; roundIndex: number; locationScore: number | null; timeScore: number | null }> = Array.isArray(data.results) ? data.results : [];
        const completed = rows.filter(r => r.playerId === playerId && r.roundIndex < currentRoundIndex);
        if (completed.length === 0) {
          setRunningAccuracy(null);
          return;
        }
        const sum = completed.reduce((acc, r) => acc + ((r.locationScore ?? 0) + (r.timeScore ?? 0)) / 2, 0);
        setRunningAccuracy(Math.round(sum / completed.length));
      })
      .catch(() => {
        if (!cancelled) setRunningAccuracy(null);
      });
    return () => { cancelled = true; };
  }, [snapshot.status, snapshot.currentRoundIndex, snapshot.gameId, playerId]);

  // Wheel zoom (desktop) — native non-passive listener so preventDefault works
  useEffect(() => {
    const container = imgContainerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      scale.current = Math.min(Math.max(scale.current * delta, 1), 8);
      applyTransform();
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [applyTransform]);

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

  // Persist sound/vibrate settings to localStorage
  useEffect(() => {
    localStorage.setItem('gh_sound', String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem('gh_vibrate', String(vibrateEnabled));
  }, [vibrateEnabled]);

  useEffect(() => {
    setDistanceUnitPreference(distanceUnit);
  }, [distanceUnit]);

  // Watch for opponent submissions and show toasts/status on every round
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
          `/api/geocode/search?q=${encodeURIComponent(value)}`
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        setSearchResults(
          (data as Array<{ display_name: string; lat: string; lon: string }>).map((r) => ({
            displayName: r.display_name.split(",").slice(0, 3).join(",").trim() || 'Player',
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
    setSearchQuery("");
    setSearchResults([]);
  };

  const closeSheet = () => {
    setActivePanel(null);
    setSearchQuery("");
    setSearchResults([]);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
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

  const handleZoomIn = () => {
    scale.current = Math.min(Math.max(scale.current * 1.25, 1), 8);
    applyTransform();
  };

  const handleZoomOut = () => {
    scale.current = Math.min(Math.max(scale.current / 1.25, 1), 8);
    if (scale.current === 1) {
      panX.current = 0;
      panY.current = 0;
    }
    applyTransform();
  };

  const handleDoubleClick = () => {
    if (scale.current > 1) {
      scale.current = 1;
      panX.current = 0;
      panY.current = 0;
    } else {
      scale.current = 2;
    }
    applyTransform();
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gestureMoved.current = 0;

    if (activePointers.current.size === 1) {
      panDragging.current = true;
      panLastX.current = e.clientX;
      panLastY.current = e.clientY;
      panLastTime.current = e.timeStamp;
      panInstantVelX.current = 0;
      panVelX.current = 0;
      if (panRafId.current) cancelAnimationFrame(panRafId.current);
    } else if (activePointers.current.size === 2) {
      panDragging.current = false;
      const pts = [...activePointers.current.values()];
      pinchPrevDist.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (panRafId.current) cancelAnimationFrame(panRafId.current);
    }
    e.preventDefault();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activePointers.current.has(e.pointerId)) return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 2 && pinchPrevDist.current !== null) {
      const pts = [...activePointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ratio = dist / pinchPrevDist.current;
      const oldScale = scale.current;
      const newScale = Math.min(Math.max(oldScale * ratio, 1), 8);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const img = imgRef.current;
      const container = imgContainerRef.current;
      if (img && container && oldScale > 0) {
        const imgRect = img.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const cx = midX - containerRect.left;
        const cy = midY - containerRect.top;
        const imgLeft = imgRect.left - containerRect.left;
        const imgTop = imgRect.top - containerRect.top;
        const zoomRatio = newScale / oldScale;
        panX.current = (cx - imgLeft - imgRect.width / 2) * (1 - zoomRatio) + panX.current;
        panY.current = (cy - imgTop - imgRect.height / 2) * (1 - zoomRatio) + panY.current;
      }
      scale.current = newScale;
      pinchPrevDist.current = dist;
      applyTransform();
    } else if (panDragging.current && activePointers.current.size === 1) {
      const dx = e.clientX - panLastX.current;
      const dy = e.clientY - panLastY.current;
      const dt = e.timeStamp - panLastTime.current;
      panInstantVelX.current = dt > 0 ? (dx / dt) * 16 : 0;
      panLastX.current = e.clientX;
      panLastY.current = e.clientY;
      panLastTime.current = e.timeStamp;
      panX.current += dx;
      if (scale.current > 1) panY.current += dy;
      gestureMoved.current += Math.abs(dx) + Math.abs(dy);
      applyTransform();
    }
    e.preventDefault();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);

    if (activePointers.current.size < 2) {
      pinchPrevDist.current = null;
    }

    if (activePointers.current.size === 0) {
      if (panDragging.current) {
        panDragging.current = false;
        panVelX.current = panInstantVelX.current;
        if (scale.current <= 1) startInertia();
      }
      if (e.pointerType !== 'mouse' && gestureMoved.current < 10) {
        const now = performance.now();
        const dt = now - lastTapTime.current;
        const dx = Math.abs(e.clientX - lastTapX.current);
        const dy = Math.abs(e.clientY - lastTapY.current);
        if (dt < 300 && dx < 30 && dy < 30) {
          handleDoubleClick();
          lastTapTime.current = 0;
        } else {
          lastTapTime.current = now;
          lastTapX.current = e.clientX;
          lastTapY.current = e.clientY;
        }
      }
    } else if (activePointers.current.size === 1) {
      const [remaining] = [...activePointers.current.values()];
      panDragging.current = true;
      panLastX.current = remaining.x;
      panLastY.current = remaining.y;
      panLastTime.current = performance.now();
      panInstantVelX.current = 0;
      panVelX.current = 0;
    }
  };

  return (
    <section className={styles.section} data-testid="round-active-section" data-status={snapshot.status} data-round-index={snapshot.currentRoundIndex}>

      {/* IMAGE CONTAINER */}
      <div
        ref={imgContainerRef}
        className={styles.imgContainer}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        data-testid="round-image-container"
      >
        {currentEvent?.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={imgRetryKey}
              ref={imgRef}
              src={currentEvent.imageUrl}
              alt="Historical event"
              draggable={false}
              className={styles.eventImg}
              onError={() => setImgError(true)}
              onLoad={() => setImgError(false)}
            />
            {imgError && (
              <div
                className={styles.imgErrorOverlay}
                onClick={() => {
                  setImgError(false);
                  setImgRetryKey((k) => k + 1);
                }}
              >
                <svg className={styles.imgErrorIcon} viewBox="0 0 24 24" fill="none" stroke="var(--gh-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span className={styles.imgErrorText}>{t('image_failed')}</span>
                <button type="button" className={styles.imgRetryBtn}>{t('tap_retry')}</button>
              </div>
            )}
          </>
        ) : (
          <div className={styles.imgPlaceholder} />
        )}

        {/* Desktop zoom controls */}
        <div className={styles.zoomControls}>
          <button
            type="button"
            className={styles.zoomBtn}
            onClick={handleZoomIn}
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className={styles.zoomBtn}
            onClick={handleZoomOut}
            aria-label="Zoom out"
            title="Zoom out"
          >
            −
          </button>
        </div>
      </div>

      {/* TIMER — portaled to document.body so it escapes the .section stacking
          context and paints above ALL modals (settings 10000, hints 1000,
          submit overlay 9000, fullscreen 9999). z-index: 10001 in CSS.
          When the WHERE sheet is open, reposition to top-left below the sheet
          header so it does not cover the guessed-location marker. */}
      {timeRemaining !== null && snapshot.config?.roundTimerSec !== 0 && (() => {
        const totalSec: number = (snapshot.config as { roundTimerSec?: number }).roundTimerSec || 120;
        const radius = 26;
        const circumference = 2 * Math.PI * radius;
        const progress = Math.max(0, Math.min(1, timeRemaining / totalSec));
        const strokeDashoffset = circumference * (1 - progress);
        const isUrgent = timeRemaining <= 10;
        const ringColor = isUrgent ? "var(--gh-danger)" : timeRemaining <= 30 ? "var(--gh-orange)" : "var(--gh-success)";
        const posClass = activePanel === 'where'
          ? styles.timerWrapperWhereSheet
          : styles.timerWrapperCentered;
        return createPortal(
          <div className={`${styles.timerWrapper} ${posClass} ${isUrgent ? styles.timerUrgent : ""}`}>
            <svg
              width="72"
              height="72"
              viewBox="0 0 72 72"
              className={styles.timerSvg}
            >
              <circle
                cx="36" cy="36" r={radius}
                fill="var(--gh-bg-elevated)"
                stroke="var(--gh-border-default)"
                strokeWidth="3"
              />
              <circle
                cx="36" cy="36" r={radius}
                fill="none"
                stroke={ringColor}
                strokeWidth="5.00"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className={styles.timerArc}
              />
            </svg>
            <span className={`${styles.timerText} ${isUrgent ? styles.timerTextUrgent : ""}`}>
              {formatTime(timeRemaining)}
            </span>
          </div>,
          document.body
        );
      })()}

      {/* ROUND PILL */}
      {snapshot.currentRoundIndex !== undefined && snapshot.config?.totalRounds !== undefined && (
        <div className={styles.roundPill}>
          <button
            type="button"
            onClick={() => setSettingsModalOpen(true)}
            className={styles.settingsBtn}
            aria-label={t('settings')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gh-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
          <span>{snapshot.currentRoundIndex + 1} / {snapshot.config.totalRounds}</span>
          {runningAccuracy !== null && (
            <span style={{ color: getAccuracyColor(runningAccuracy) }}>
              · {runningAccuracy}<AccuracySuffix />
            </span>
          )}
        </div>
      )}

      {/* NOTIFICATION BELL — under the settings gear, only when unread */}
      <div className={styles.settingsBellWrap}>
        <NotificationBell onlyShowWhenUnread />
      </div>

      {/* OPPONENT AVATARS */}
      {snapshot.players && snapshot.players.length >= 2 && playerId && (
        <div className={styles.opponentList}>
          {snapshot.players
            .filter((p) => p.playerId !== playerId)
            .map((p) => (
                <div key={p.playerId} className={styles.opponentRow}>
                  {submittedToasts[p.playerId] && (
                    <div className={styles.submittedToast}>{t('guessed')}</div>
                  )}
                  {!p.hasSubmitted && !submittedToasts[p.playerId] && (
                    <div
                      className={styles.submittedToast}
                      style={{ animation: "none", opacity: 1, color: "var(--gh-text-tertiary)" }}
                    >
                      {t('waiting_for')}
                    </div>
                  )}
                  <PlayerAvatar
                    avatarUrl={p.avatarUrl ?? null}
                    displayName={p.displayName || p.playerId.slice(0, 8)}
                    playerId={p.playerId}
                    size={42}
                    submitted={p.hasSubmitted}
                  />
                </div>
              ))
            }
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
                {locationName ?? t('location_set')}
              </div>
            )}
            <button
              type="button"
              onClick={() => setMapFullscreen(false)}
              className={styles.mapCloseBtn}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--gh-text-primary)" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM PANEL */}
      <div className={styles.bottomPanel} data-testid="round-bottom-panel">
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
            aria-label={t('hints')}
            data-testid="round-hints-btn"
          >
            <span className={styles.hintsCount}>{hintsUsedCount ?? 0}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gh-text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.663 17h4.673M12 3v1m0 16v1M4.22 4.22l.707.707M19.778 19.778l-.707-.707M3 12h1m16 0h1M4.22 19.778l.707-.707M19.778 4.22l-.707.707M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z" />
            </svg>
          </button>

          {/* WHEN — left of WHERE */}
          <div className={styles.circleWrap}>
            <span className={`${styles.overlayTag} ${styles.overlayTagWhen} ${guessYear !== null ? styles.overlayTagAnswer : ""}`}>
              {guessYear !== null ? String(guessYear) : t('when')}
            </span>
            <button
              type="button"
              onClick={() => {
                if (activePanel === 'when') {
                  closeSheet();
                } else {
                  setActivePanel('when');
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
              aria-label={t('when')}
              data-testid="round-when-btn"
            >
              <WhenIcon className={styles.btnIcon} size={44} style={{ color: 'var(--gh-text-primary)' }} />
            </button>
          </div>

          {/* WHERE — right of WHEN */}
          <div className={styles.circleWrap}>
            <span className={`${styles.overlayTag} ${styles.overlayTagWhere} ${guessLocation !== null ? styles.overlayTagWhereAnswer : ""}`}>
              {guessLocation !== null
                ? (locationName ?? "✓").split(",")[0].trim()
                : t('where')}
            </span>
            <button
              type="button"
              onClick={() => {
                if (activePanel === 'where') {
                  closeSheet();
                } else {
                  setActivePanel('where');
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
              aria-label={t('where')}
              data-testid="round-where-btn"
            >
              <WhereIcon className={styles.btnIcon} size={44} style={{ color: 'var(--gh-text-primary)' }} />
            </button>
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={() => {
              if (!canSubmit) {
                const missing: string[] = [];
                if (guessLocation === null) missing.push(t('where'));
                if (guessYear === null) missing.push(t('when'));
                setGuessHint(t('hint_select_both', { where: t('where'), when: t('when') }));
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
            aria-label={t('submit')}
            data-testid="round-submit-btn"
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
            className={`${styles.sheet} ${activePanel === 'where' ? styles.sheetFull : ""} ${activePanel === 'when' ? styles.sheetWhen : ""}`}
            style={sheetViewportStyle}
          >
            {/* WHERE sheet */}
            {activePanel === 'where' && (
              <>
                <div className={styles.sheetHeader}>
                  <div className={styles.sheetHeaderLeft}>
                    <WhereIcon className={styles.sheetHeaderIcon} size={48} style={{ color: 'var(--gh-teal)' }} />
                    <div className={styles.sheetHeaderMeta}>
                      <span className={styles.sheetHeaderValue}>
                        {guessLocation !== null
                          ? locationName ?? t('location_set')
                          : t('no_location_set')}
                      </span>
                    </div>
                  </div>
                  <button type="button" className={styles.sheetCloseBtn} onClick={closeSheet} aria-label={tNav('close')}>
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
                      ref={whereSearchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder={t('search_place_placeholder')}
                      disabled={isLocked}
                      className={`${styles.sheetField} ${styles.sheetFieldWithIcon}`}
                    />
                    {(searchResults.length > 0 || searchLoading) && (
                      <div className={styles.sheetSearchDropdown}>
                        {searchLoading && <div className={styles.sheetSearchLoading}>{t('searching')}</div>}
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
                  {guessLocation !== null ? t('confirm_location') : t('tap_map_to_set')}
                </button>
              </>
            )}

            {/* WHEN sheet */}
            {activePanel === 'when' && (
              <>
                <div className={styles.sheetHeader}>
                  <div className={styles.sheetHeaderLeft}>
                    <WhenIcon className={styles.sheetHeaderIcon} size={48} style={{ color: 'var(--gh-violet)' }} />
                    <div className={styles.sheetHeaderMeta}>
                      <span className={styles.sheetHeaderValue}>
                        {guessYear !== null ? String(guessYear) : t('no_year_set')}
                      </span>
                    </div>
                  </div>
                  <button type="button" className={styles.sheetCloseBtn} onClick={closeSheet} aria-label={tNav('close')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <div className={styles.sheetScrollBody}>
                  <div className={styles.sheetPickerWrap}>
                    <YearPicker
                      value={guessYear ?? Math.min(yearMax, 2000)}
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
                        ref={yearEditInputRef}
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
                        placeholder={t('enter_year_placeholder', { min: yearMin, max: yearMax })}
                        min={yearMin}
                        max={yearMax}
                        className={styles.sheetField}
                      />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className={`${styles.sheetConfirmBtn} ${styles.sheetConfirmWhen} ${guessYear !== null ? styles.sheetConfirmReady : ""}`}
                  onClick={closeSheet}
                  disabled={guessYear === null}
                >
                  {guessYear !== null ? t('confirm_year') : t('pick_year_to_continue')}
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
              <path d="M2 2l6 6M8 2L2 8" stroke="var(--gh-orange)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>

          <div className={styles.settingsCard} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => { setHomeNavigating(true); window.location.href = '/home'; }}
              disabled={homeNavigating}
              className={styles.settingsHomeBtn}
            >
              {homeNavigating ? (
                <span className={styles.settingsHomeSpinner} aria-hidden="true" />
              ) : (
                <span className={styles.settingsHomeIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
                    <polyline points="9 21 9 12 15 12 15 21" />
                  </svg>
                </span>
              )}
              {tNav('home')}
            </button>
            <div className={styles.settingsTitle}>{t('settings')}</div>

            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>{t('sound')}</span>
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={styles.toggle}
                style={{
                  "--toggle-bg": soundEnabled ? "var(--gh-orange)" : "var(--gh-modal-toggle-off)",
                  "--toggle-left": soundEnabled ? "22px" : "2px",
                } as React.CSSProperties}
              >
                <div className={styles.toggleKnob} />
              </button>
            </div>

            <div className={styles.settingsRowLast}>
              <span className={styles.settingsLabel}>{t('vibrate')}</span>
              <button
                type="button"
                onClick={() => setVibrateEnabled(!vibrateEnabled)}
                className={styles.toggle}
                style={{
                  "--toggle-bg": vibrateEnabled ? "var(--gh-orange)" : "var(--gh-modal-toggle-off)",
                  "--toggle-left": vibrateEnabled ? "22px" : "2px",
                } as React.CSSProperties}
              >
                <div className={styles.toggleKnob} />
              </button>
            </div>

            <div className={styles.settingsLanguageRow}>
              <span className={styles.settingsLanguageLabel}>{tNav('language')}</span>
              <LanguageDropdown
                onLocaleChange={(loc) => startLocaleTransition(() => { setLocale(loc); })}
                pending={localePending}
              />
            </div>

            <div className={styles.settingsLanguageRow}>
              <span className={styles.settingsLanguageLabel}>{tNav('theme')}</span>
              <ThemeToggle />
            </div>

            <div className={styles.settingsLanguageRow}>
              <span className={styles.settingsLanguageLabel}>{t('distance_unit')}</span>
              <div className={styles.settingsLanguageToggle} role="group" aria-label={t('distance_unit')}>
                {(['km','mi'] as const).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => setDistanceUnit(unit)}
                    className={`${styles.settingsLanguageOption} ${distanceUnit === unit ? styles.settingsLanguageOptionActive : ''}`}
                    aria-pressed={distanceUnit === unit}
                  >
                    {unit}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.settingsDivider} />

          </div>
        </div>
      )}

    </section>
  );
}
