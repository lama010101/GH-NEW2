import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { animate } from 'framer-motion';
import { useGesture } from '@use-gesture/react';
import type { PinchState } from '@use-gesture/react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/useSettingsStore';
import { useVibrate } from '@/hooks/useVibrate';

export type YearPickerScale = 'century' | 'decade' | 'year';

export type YearPickerProps = {
  value: number;
  onChange: (year: number) => void;
  defaultScale?: YearPickerScale;
  onScaleChange?: (scale: YearPickerScale) => void;
  min?: number;
  max?: number;
  className?: string;
  /**
   * When false, the current value is treated as an uncommitted/default center value.
   * Tick labels will remain in the neutral foreground color until the year is actually selected.
   * Defaults to true to preserve existing behavior.
   */
  valueIsCommitted?: boolean;
};

type ViewportState = {
  leftTick: number;
  step: number;
  count: number;
};

type YearPickerHandle = {
  centerOn: (year: number) => void;
  setScale: (scale: YearPickerScale) => void;
};

const SCALE_ORDER: YearPickerScale[] = ['century', 'decade', 'year'];
const SCALE_BUTTON_ORDER: YearPickerScale[] = ['year', 'decade', 'century'];
const SCALE_STEP: Record<YearPickerScale, number> = {
  century: 100,
  decade: 10,
  year: 1,
};

const DEFAULT_MIN = -100;
const DEFAULT_MAX = 2025;
const TICK_COUNT = 11;
const MOMENTUM_MULTIPLIER = 260;
const WHEEL_THRESHOLD = 60;
const PINCH_THRESHOLD = 0.04;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

const floorToStep = (n: number, step: number) => {
  if (step === 0) return n;
  return Math.floor(n / step) * step;
};

const roundToStep = (n: number, step: number) => {
  if (step === 0) return n;
  return Math.round(n / step) * step;
};

const normalizeZeroYear = (year: number) => (year === 0 ? 1 : year);

const alignCenterToScale = (year: number, scale: YearPickerScale) => {
  const step = SCALE_STEP[scale];
  if (step <= 1) {
    return year;
  }
  return roundToStep(year, step);
};

const computeWindow = (
  centerYear: number,
  scale: YearPickerScale,
  min: number,
  max: number,
): ViewportState => {
  const step = SCALE_STEP[scale];
  const half = Math.floor((TICK_COUNT - 1) / 2);
  const normalized = normalizeZeroYear(clamp(centerYear, min, max));
  const alignedCenter = alignCenterToScale(normalized, scale);
  const left = alignedCenter - step * half;
  return { leftTick: left, step, count: TICK_COUNT };
};

const getScaleIndex = (scale: YearPickerScale) => SCALE_ORDER.indexOf(scale);

const resolveNextScale = (current: YearPickerScale, direction: 1 | -1) => {
  const next = getScaleIndex(current) + direction;
  return SCALE_ORDER[clamp(next, 0, SCALE_ORDER.length - 1)] ?? current;
};

const useResizeObserver = (target: React.RefObject<HTMLElement>): number => {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = target.current;
    if (!el) return;

    setWidth(el.clientWidth);

    const observer = new ResizeObserver((entries) => {
      if (!entries.length) return;
      setWidth(entries[0]!.contentRect.width);
    });

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [target]);

  return width;
};

export const YearPicker = forwardRef<YearPickerHandle, YearPickerProps>(
  (
    {
      value,
      onChange,
      defaultScale = 'century',
      onScaleChange,
      min = DEFAULT_MIN,
      max = DEFAULT_MAX,
      className,
      valueIsCommitted = true,
    },
    ref,
  ) => {
    const clampedInitialValue = clamp(value, min, max);
    const initialValue = normalizeZeroYear(clampedInitialValue);

    const [scale, setScaleState] = useState<YearPickerScale>(defaultScale);
    const [viewport, setViewport] = useState<ViewportState>(() =>
      computeWindow(initialValue, defaultScale, min, max),
    );
    const wheelDeltaRef = useRef(0);
    const dragStartValueRef = useRef(initialValue);
    const valueRef = useRef(initialValue);
    const containerRef = useRef<HTMLDivElement>(null);
    const railRef = useRef<HTMLDivElement>(null);
    const tickContainerRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);
    const lastDragTickRef = useRef<number | null>(null);
    const vibrateEnabled = useSettingsStore((state) => state.vibrateEnabled);
    const vibrate = useVibrate();
    const width = useResizeObserver(containerRef);
    const ticks = useMemo(() => {
      return Array.from({ length: viewport.count }, (_, index) => viewport.leftTick + viewport.step * index);
    }, [viewport]);

    // Stable reference to latest onChange to avoid including it in effect deps
    const onChangeRef = useRef(onChange);
    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    const timelineVisible = typeof min === 'number' && typeof max === 'number' && min < max;
    const resolvedSelectedTick = useMemo(
      () => normalizeZeroYear(alignCenterToScale(value, scale)),
      [scale, value],
    );
    const snapToCurrentStep = useCallback(
      (year: number) => {
        const step = SCALE_STEP[scale];
        if (step <= 1) {
          return Math.round(year);
        }
        return roundToStep(year, step);
      },
      [scale],
    );

    const effectiveWidth = useMemo(() => Math.max(width - 48, 0), [width]);

    const updateViewport = useCallback(
      (year: number, activeScale = scale) => {
        setViewport(computeWindow(year, activeScale, min, max));
      },
      [scale, min, max],
    );

    const emitChange = useCallback(
      (year: number) => {
        const snapped = snapToCurrentStep(year);
        const clamped = clamp(snapped, min, max);
        const sanitized = normalizeZeroYear(clamped);
        valueRef.current = sanitized;
        if (sanitized !== value) {
          onChangeRef.current(sanitized);
        }
      },
      [value, min, max, snapToCurrentStep],
    );

    const viewportCenter = useMemo(() => {
      if (viewport.count <= 0) return valueRef.current ?? value;
      const centerIndex = Math.floor((viewport.count - 1) / 2);
      return viewport.leftTick + viewport.step * centerIndex;
    }, [viewport.count, viewport.leftTick, viewport.step, value]);

    const zoomTo = useCallback(
      (nextScale: YearPickerScale, pivotYear?: number) => {
        setScaleState((prev) => {
          if (prev === nextScale) return prev;
          onScaleChange?.(nextScale);

          const resolvePivot = (): number => {
            if (typeof pivotYear === 'number' && Number.isFinite(pivotYear)) {
              return pivotYear;
            }

            const committedValue = Number.isFinite(valueRef.current) ? valueRef.current! : null;
            const currentCenter = Number.isFinite(viewportCenter) ? viewportCenter! : null;

            if (!valueIsCommitted) {
              if (currentCenter != null) return currentCenter;
              if (committedValue != null) return committedValue;
            } else {
              if (committedValue != null) return committedValue;
              if (currentCenter != null) return currentCenter;
            }

            if (Number.isFinite(value)) {
              return value;
            }

            return 0;
          };

          const nextStep = SCALE_STEP[nextScale];
          const prevStep = SCALE_STEP[prev];
          const isZoomingOut = nextStep > prevStep;
          void isZoomingOut;
          const pivotAligned = prevStep > 1 ? roundToStep(resolvePivot(), prevStep) : resolvePivot();

          const snapped = (() => {
            if (pivotYear != null) {
              return floorToStep(pivotAligned, nextStep);
            }
            // Always align to the new scale’s bucket center when changing scale.
            return roundToStep(pivotAligned, nextStep);
          })();

          const targetYear = clamp(snapped, min, max);
          const sanitizedTarget = normalizeZeroYear(targetYear);
          valueRef.current = sanitizedTarget;
          updateViewport(sanitizedTarget, nextScale);
          return nextScale;
        });
      },
      [max, min, onScaleChange, updateViewport, value, valueIsCommitted, viewportCenter],
    );

    const zoomIn = useCallback(
      (pivotYear?: number) => {
        const next = resolveNextScale(scale, 1);
        if (next !== scale) {
          zoomTo(next, pivotYear);
        }
      },
      [scale, zoomTo],
    );

    const zoomOut = useCallback(() => {
      const next = resolveNextScale(scale, -1);
      if (next !== scale) {
        zoomTo(next);
      }
    }, [scale, zoomTo]);

    useImperativeHandle(
      ref,
      () => ({
        centerOn: (year: number) => {
          const clamped = clamp(Math.round(year), min, max);
          const sanitized = normalizeZeroYear(clamped);
          valueRef.current = sanitized;
          onChange(sanitized);
          updateViewport(sanitized);
        },
        setScale: (next: YearPickerScale) => {
          if (!SCALE_ORDER.includes(next)) return;
          zoomTo(next);
        },
      }),
      [min, max, onChange, updateViewport, zoomTo],
    );

    useEffect(() => {
      const clamped = clamp(value, min, max);
      const sanitized = normalizeZeroYear(clamped);
      valueRef.current = sanitized;
      updateViewport(sanitized);
    }, [value, min, max, updateViewport]);

    useEffect(() => {
      momentumControls.current?.stop();
      return () => {
        momentumControls.current?.stop();
      };
    }, []);

    const pixelsPerStep = useMemo(() => {
      if (viewport.count <= 1 || effectiveWidth === 0) return 0;
      return effectiveWidth / (viewport.count - 1);
    }, [effectiveWidth, viewport.count]);

    const yearsPerPixel = useMemo(() => {
      if (pixelsPerStep === 0) return 0;
      return viewport.step / pixelsPerStep;
    }, [pixelsPerStep, viewport.step]);

    const momentumControls = useRef<ReturnType<typeof animate> | null>(null);

    const launchMomentum = useCallback(
      (velocityPixels: number) => {
        if (yearsPerPixel === 0) return;
        if (SCALE_STEP[scale] > 1) return;
        const velocityYears = -velocityPixels * yearsPerPixel;
        if (Math.abs(velocityYears) < 0.01) return;
        momentumControls.current?.stop();
        const startValue = valueRef.current;
        const target = startValue + velocityYears * MOMENTUM_MULTIPLIER * 0.01;
        momentumControls.current = animate(startValue, target, {
          type: 'inertia',
          velocity: velocityYears,
          min,
          max,
          power: 0.8,
          timeConstant: 260,
          bounceDamping: 30,
          bounceStiffness: 200,
          restDelta: 0.2,
          onUpdate: (latest) => {
            emitChange(latest);
          },
        });
      },
      [emitChange, max, min, yearsPerPixel, scale],
    );

    const gestureTarget = railRef;

    useGesture(
      {
        onDragStart: () => {
          isDraggingRef.current = true;
          dragStartValueRef.current = snapToCurrentStep(valueRef.current);
          lastDragTickRef.current = dragStartValueRef.current;
          momentumControls.current?.stop();
        },
        onDrag: ({ movement: [mx], last, velocity: [vx], direction: [dirX] }) => {
          if (yearsPerPixel === 0) return;
          const deltaYears = -mx * yearsPerPixel;
          const nextValue = dragStartValueRef.current + deltaYears;
          const snapped = snapToCurrentStep(nextValue);
          if (snapped !== lastDragTickRef.current) {
            lastDragTickRef.current = snapped;
            if (vibrateEnabled && vibrate) {
              try {
                vibrate(25);
              } catch {
                // Ignore unsupported/blocked vibration errors.
              }
            }
          }
          emitChange(nextValue);
          if (last) {
            isDraggingRef.current = false;
            launchMomentum(vx * dirX * pixelsPerStep);
          }
        },
        onWheel: ({ event, delta: [, dy] }) => {
          event.preventDefault();
          const next = wheelDeltaRef.current + dy;
          if (Math.abs(next) > WHEEL_THRESHOLD) {
            if (next > 0) {
              zoomOut();
            } else {
              zoomIn();
            }
            wheelDeltaRef.current = 0;
          } else {
            wheelDeltaRef.current = next;
          }
        },
        onPinch: (state: PinchState) => {
          const {
            offset: [distance],
            last,
            memo,
          } = state;
          const previous = (memo as number | undefined) ?? distance;
          const delta = distance - previous;
          if (!last) {
            if (delta > PINCH_THRESHOLD) {
              zoomIn();
            } else if (delta < -PINCH_THRESHOLD) {
              zoomOut();
            }
          }
          return distance;
        },
      },
      {
        target: gestureTarget,
        eventOptions: { passive: false },
        drag: { filterTaps: true, axis: 'x' },
        wheel: { axis: 'y' },
        pinch: { scaleBounds: { min: 0.5, max: 4 } },
      },
    );

    const handleTimelineClick = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.defaultPrevented) return;
        if (event.detail > 1) return;
        if (isDraggingRef.current) return;

        if (vibrateEnabled && vibrate) {
          try {
            vibrate(25);
          } catch {
            // Ignore unsupported/blocked vibration errors.
          }
        }

        const container = tickContainerRef.current ?? railRef.current;
        if (!container || viewport.count <= 1) return;

        const rect = container.getBoundingClientRect();
        if (rect.width === 0) return;

        momentumControls.current?.stop();

        const relativeX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const range = viewport.step * (viewport.count - 1);
        const targetYear = viewport.leftTick + relativeX * range;
        emitChange(targetYear);
      },
      [emitChange, vibrate, vibrateEnabled, viewport.count, viewport.leftTick, viewport.step],
    );

    const onTimelineDoubleClick = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        const nextScale = resolveNextScale(scale, 1);
        if (nextScale === scale) return;
        const container = tickContainerRef.current ?? railRef.current;
        if (!container || viewport.count <= 1) return;
        const rect = container.getBoundingClientRect();
        if (rect.width === 0) return;
        const relativeX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const range = viewport.step * (viewport.count - 1);
        const targetYear = viewport.leftTick + relativeX * range;
        zoomTo(nextScale, targetYear);
      },
      [scale, viewport.count, viewport.leftTick, viewport.step, zoomTo],
    );

    const tickLabelFormatter = useCallback((year: number) => String(year), []);

    return (
      <div
        className={cn('relative flex flex-col gap-2', className)}
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          width: '100%',
          minWidth: 0,
          height: '5.5rem',
        }}
      >
        <div
          ref={containerRef}
          className="relative h-[4.5rem] select-none overflow-hidden touch-none md:touch-pan-x"
          style={{
            position: 'relative',
            height: '4.5rem',
            width: '100%',
            minWidth: 0,
            overflow: 'hidden',
            userSelect: 'none',
            touchAction: 'none',
          }}
          onClick={handleTimelineClick}
          onDoubleClick={onTimelineDoubleClick}
        >
          <div
            className="pointer-events-auto absolute inset-0 touch-none"
            ref={railRef}
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'auto',
              touchAction: 'none',
            }}
          >
            {timelineVisible ? (
              <>
                <div
                  className="absolute left-0 right-0 top-4"
                  style={{ position: 'absolute', left: 0, right: 0, top: '1rem' }}
                >
                  <div
                    className="h-px w-full bg-gradient-to-r from-transparent via-foreground/40 to-transparent"
                    style={{
                      height: 1,
                      width: '100%',
                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                    }}
                  />
                </div>

                <div
                  className="absolute left-0 top-1/2 flex h-full w-full -translate-y-1/2 flex-col"
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: '50%',
                    display: 'flex',
                    height: '100%',
                    width: '100%',
                    transform: 'translateY(-50%)',
                    flexDirection: 'column',
                  }}
                >
                  <div className="relative h-full" style={{ position: 'relative', height: '100%', width: '100%' }}>
                    <div
                      className="absolute inset-y-0 left-0 right-0 pointer-events-none"
                      ref={tickContainerRef}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: 0,
                        right: 0,
                        pointerEvents: 'none',
                      }}
                    >
                      {/* Dark grey background zone between the two lines */}
                      <div
                        className="absolute left-0 right-0 pointer-events-none"
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          pointerEvents: 'none',
                          top: '0.01rem',
                          bottom: '2.1rem',
                          background: 'linear-gradient(90deg, #2a2a2a 0%, #47484aff 50%, #2a2a2a 100%)',
                        }}
                      />
                      <div
                        className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-foreground/40 to-transparent"
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          height: 1,
                          top: '0.01rem',
                          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                        }}
                      />
                      <div
                        className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-foreground/40 to-transparent"
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          height: 1,
                          bottom: '2.1rem',
                          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                        }}
                      />
                      {/** Precompute center index for fade calculations */}
                      {(() => {
                        const centerIndex = (ticks.length - 1) / 2;
                        return ticks.map((tick, index) => {
                          const isActive = tick === resolvedSelectedTick;
                          const isSelectedTick = isActive && valueIsCommitted;
                          const withinVisibleRange = tick >= min && tick <= max;
                          const isYearZero = tick === 0;
                          const positionPercent = ticks.length <= 1 ? 50 : (index / (ticks.length - 1)) * 100;
                          const distanceFactor = centerIndex === 0 ? 0 : Math.min(Math.abs(index - centerIndex) / centerIndex, 1);
                          const baseOpacity = isActive
                            ? 1
                            : Math.max(0.35, 1 - distanceFactor * 0.6);
                          const tickLineClasses = (() => {
                            const base = 'h-[0.85rem] w-px rounded-full transition-all';
                            if (!withinVisibleRange) {
                              return cn(base, 'bg-transparent opacity-0');
                            }
                            if (isYearZero) {
                              return cn(
                                base,
                                'bg-transparent border-l border-dotted',
                                isActive ? 'border-[hsl(var(--secondary))]' : 'border-slate-400',
                              );
                            }
                            return cn(
                              base,
                              isActive
                                ? 'bg-[hsl(var(--secondary))] h-[0.9rem] w-[3px] -translate-y-0 transform'
                                : 'bg-foreground',
                            );
                          })();
                          const labelClasses = cn(
                            'text-xs transition-colors',
                            withinVisibleRange
                              ? isSelectedTick
                                ? 'text-[hsl(var(--secondary))] font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]'
                                : 'text-foreground/80'
                              : 'text-transparent',
                          );
                          const labelText = withinVisibleRange ? (isYearZero ? '' : tickLabelFormatter(tick)) : '';
                          return (
                            <div
                              key={tick}
                              className="absolute flex h-full flex-col items-center gap-1.5 pointer-events-none"
                              style={{
                                position: 'absolute',
                                display: 'flex',
                                height: '100%',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '0.375rem',
                                pointerEvents: 'none',
                                left: `${positionPercent}%`,
                                transform: 'translateX(-50%)',
                              }}
                            >
                              <div
                                className={tickLineClasses}
                                style={{
                                  width: isActive && !isYearZero ? 3 : 1,
                                  height: isActive && !isYearZero ? '0.9rem' : '0.85rem',
                                  borderRadius: 999,
                                  background: !withinVisibleRange || isYearZero
                                    ? 'transparent'
                                    : isActive
                                      ? '#ffae42'
                                      : 'rgba(255,255,255,0.8)',
                                  borderLeft: isYearZero && withinVisibleRange ? `1px dotted ${isActive ? '#ffae42' : 'rgb(148, 163, 184)'}` : undefined,
                                  opacity: baseOpacity,
                                  transition: 'all 150ms ease',
                                }}
                              />
                              <div
                                className={labelClasses}
                                style={{
                                  minWidth: '3ch',
                                  textAlign: 'center',
                                  opacity: isActive ? 1 : baseOpacity,
                                  fontSize: '0.75rem',
                                  lineHeight: '1rem',
                                  color: withinVisibleRange
                                    ? isSelectedTick
                                      ? '#ffae42'
                                      : 'rgba(255,255,255,0.8)'
                                    : 'transparent',
                                  fontWeight: isSelectedTick ? 600 : 400,
                                  transition: 'color 150ms ease',
                                }}
                              >
                                {labelText}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>

              </>
            ) : null}
          </div>
        </div>

        {timelineVisible ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-0 z-10"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 10,
              display: 'flex',
              justifyContent: 'center',
              paddingLeft: 0,
              paddingRight: 0,
              pointerEvents: 'none',
            }}
          >
            <div
              className="flex w-full items-center gap-[0.01rem] rounded-full border border-foreground/10 bg-foreground/5 px-2 py-1.5 text-[0.62rem] uppercase tracking-[0.2em] text-foreground/70 shadow-sm"
              style={{
                display: 'flex',
                width: '100%',
                alignItems: 'center',
                gap: '0.01rem',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)',
                padding: '0.375rem 0.5rem',
                fontSize: '0.62rem',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                color: 'rgba(255,255,255,0.7)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
              }}
            >
              {SCALE_BUTTON_ORDER.map((option) => {
                const isActive = option === scale;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      zoomTo(option);
                    }}
                    className={cn(
                      'pointer-events-auto flex-1 rounded-full px-2 py-0.5 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--secondary))] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      isActive
                        ? 'bg-[hsl(var(--secondary)/0.15)] text-[hsl(var(--secondary))] shadow-sm'
                        : 'text-foreground/70 hover:bg-foreground/10 hover:text-foreground',
                    )}
                    style={{
                      pointerEvents: 'auto',
                      flex: 1,
                      borderRadius: 999,
                      border: 'none',
                      padding: '0.125rem 0.5rem',
                      textAlign: 'center',
                      background: isActive ? 'rgba(255,174,66,0.15)' : 'transparent',
                      color: isActive ? '#ffae42' : 'rgba(255,255,255,0.7)',
                      boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
                      transition: 'all 150ms ease',
                    }}
                    aria-pressed={isActive}
                    aria-label={`Zoom to ${option} view`}
                  >
                    {option.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);

YearPicker.displayName = 'YearPicker';

export type { YearPickerHandle };
