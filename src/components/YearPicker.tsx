import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type YearPickerScale = 'century' | 'decade' | 'year';

export type YearPickerProps = {
  value: number;
  onChange: (year: number) => void;
  defaultScale?: YearPickerScale;
  onScaleChange?: (scale: YearPickerScale) => void;
  min?: number;
  max?: number;
  className?: string;
  valueIsCommitted?: boolean;
};

type YearPickerHandle = {
  centerOn: (year: number) => void;
  setScale: (scale: YearPickerScale) => void;
};

const DEFAULT_MIN = -100;
const DEFAULT_MAX = 2025;

const CENTURY_W = 72;
const DECADE_W = 72;
const YEAR_W = 64;
const ITEM_H = 44;
const FADE_W = 40;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function yearToCentury(year: number): number {
  if (year > 0) return Math.ceil(year / 100);
  return Math.floor((year - 1) / 100);
}

function centuryToYearRange(c: number): [number, number] {
  if (c > 0) return [(c - 1) * 100 + 1, c * 100];
  return [c * 100, c * 100 + 99];
}

function decadeToYearRange(d: number): [number, number] {
  if (d >= 0) return [d, d + 9];
  return [d, d + 9];
}

type Translator = (key: string, values?: Record<string, string | number | Date>) => string;

function centuryLabel(c: number, t: Translator): string {
  if (c <= 0) {
    const bc = Math.abs(c) + 1;
    return `${bc} ${t('bc_suffix')}`;
  }
  const sfx = c === 1 ? t('rank_st') : c === 2 ? t('rank_nd') : c === 3 ? t('rank_rd') : t('rank_th');
  return `${c}${sfx}`;
}

function decadeLabel(d: number, t: Translator): string {
  if (d >= 0) return `${d}${t('decade_suffix')}`;
  return `${d}${t('decade_suffix')}`;
}

function yearLabel(y: number, t: Translator): string {
  if (y > 0) return String(y);
  return `${Math.abs(y) === 0 ? 1 : Math.abs(y)} ${t('bc_suffix')}`;
}

function centuriesInRange(min: number, max: number): number[] {
  const lo = yearToCentury(min);
  const hi = yearToCentury(max);
  const out: number[] = [];
  for (let c = lo; c <= hi; c++) {
    if (c === 0) continue;
    out.push(c);
  }
  return out;
}

function decadesForCentury(c: number, min: number, max: number): number[] {
  const [cLo, cHi] = centuryToYearRange(c);
  const lo = clamp(cLo, min, max);
  const hi = clamp(cHi, min, max);
  const out: number[] = [];
  const dStart = Math.floor(lo / 10) * 10;
  for (let d = dStart; d <= hi; d += 10) {
    if (d + 9 >= lo && d <= hi) out.push(d);
  }
  return out;
}

function yearsForDecade(d: number, min: number, max: number): number[] {
  const [dLo, dHi] = decadeToYearRange(d);
  const lo = clamp(dLo, min, max);
  const hi = clamp(dHi, min, max);
  const out: number[] = [];
  for (let y = lo; y <= hi; y++) {
    if (y === 0) continue;
    out.push(y);
  }
  return out;
}

const INDICATOR_COLOR = 'rgba(0, 180, 255, 0.5)';
const ACTIVE_BG = 'rgba(0, 180, 255, 0.18)';
const ACTIVE_BORDER = '1.5px solid rgba(0, 180, 255, 0.6)';
const ACTIVE_BG_COMMITTED = 'rgba(0, 220, 120, 0.18)';
const ACTIVE_BORDER_COMMITTED = '1.5px solid rgba(0, 220, 120, 0.6)';
const INACTIVE_COLOR = 'rgba(255,255,255,0.65)';
const LABEL_COLOR = 'rgba(255,255,255,0.60)';
const FADE_MASK = `linear-gradient(to right, transparent 0px, black ${FADE_W}px, black calc(100% - ${FADE_W}px), transparent 100%)`;

interface RailProps {
  items: number[];
  selected: number;
  itemWidth: number;
  labelFn: (v: number) => string;
  onSelect: (v: number) => void;
  committed?: boolean;
  tierLabel: string;
}

function Rail({ items, selected, itemWidth, labelFn, onSelect, committed, tierLabel }: RailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const settledRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScrollingProgrammatically = useRef(false);

  const scrollToItem = useCallback((value: number, smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = items.indexOf(value);
    if (idx === -1) return;
    const containerW = el.clientWidth;
    const spacer = containerW / 2 - itemWidth / 2;
    const itemLeft = spacer + idx * itemWidth;
    const targetScroll = itemLeft - containerW / 2 + itemWidth / 2;
    isScrollingProgrammatically.current = true;
    el.scrollTo({ left: targetScroll, behavior: smooth ? 'smooth' : 'instant' });
    setTimeout(() => { isScrollingProgrammatically.current = false; }, 400);
  }, [items, itemWidth]);

  useEffect(() => {
    scrollToItem(selected, false);
  }, [items, selected, scrollToItem]);

  const handleScroll = useCallback(() => {
    if (isScrollingProgrammatically.current) return;
    if (settledRef.current) clearTimeout(settledRef.current);
    settledRef.current = setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      const containerW = el.clientWidth;
      const spacer = containerW / 2 - itemWidth / 2;
      const scrollLeft = el.scrollLeft;
      const centerX = scrollLeft + containerW / 2;
      const idx = Math.round((centerX - spacer - itemWidth / 2) / itemWidth);
      const clamped = clamp(idx, 0, items.length - 1);
      const val = items[clamped];
      if (val !== undefined && val !== selected) {
        onSelect(val);
      }
    }, 120);
  }, [items, itemWidth, selected, onSelect]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scrollend', handleScroll as EventListener);
    el.addEventListener('scroll', handleScroll as EventListener, { passive: true });
    return () => {
      el.removeEventListener('scrollend', handleScroll as EventListener);
      el.removeEventListener('scroll', handleScroll as EventListener);
    };
  }, [handleScroll]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        color: LABEL_COLOR,
        letterSpacing: '1px',
        textTransform: 'uppercase',
        paddingLeft: 6,
        userSelect: 'none',
      }}>
        {tierLabel}
      </div>
      <div style={{
        background: 'var(--gh-glass-bg)',
        borderRadius: 8,
        padding: '4px 0',
      }}>
        <div style={{ position: 'relative' }}>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            overflowX: 'scroll',
            overflowY: 'hidden',
            scrollSnapType: 'x mandatory',
            height: ITEM_H,
            WebkitOverflowScrolling: 'touch',
            msOverflowStyle: 'none',
            scrollbarWidth: 'none',
            WebkitMaskImage: FADE_MASK,
            maskImage: FADE_MASK,
          } as React.CSSProperties}
        >
          <SpacerEl scrollRef={scrollRef} itemWidth={itemWidth} />
          {items.map((v) => {
            const isActive = v === selected;
            const isConfirmed = isActive && committed;
            return (
              <button
                key={v}
                type="button"
                onClick={() => {
                  onSelect(v);
                  scrollToItem(v, true);
                }}
                style={{
                  flexShrink: 0,
                  width: itemWidth,
                  height: ITEM_H,
                  scrollSnapAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? 'white' : INACTIVE_COLOR,
                  background: isActive ? (isConfirmed ? ACTIVE_BG_COMMITTED : ACTIVE_BG) : 'transparent',
                  border: isActive ? (isConfirmed ? ACTIVE_BORDER_COMMITTED : ACTIVE_BORDER) : 'none',
                  transform: isActive ? 'scale(1.05)' : 'none',
                  transition: 'transform 0.15s, background 0.15s, border 0.15s',
                  cursor: 'pointer',
                  outline: 'none',
                  userSelect: 'none',
                } as React.CSSProperties}
              >
                {labelFn(v)}
              </button>
            );
          })}
          <SpacerEl scrollRef={scrollRef} itemWidth={itemWidth} />
        </div>
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 2,
          background: INDICATOR_COLOR,
          pointerEvents: 'none',
          zIndex: 2,
        }} />
      </div>
      </div>
    </div>
  );
}

function SpacerEl({ scrollRef, itemWidth }: { scrollRef: React.RefObject<HTMLDivElement>; itemWidth: number }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setW(Math.max(0, el.clientWidth / 2 - itemWidth / 2));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef, itemWidth]);
  return <div style={{ flexShrink: 0, width: w, height: ITEM_H }} />;
}

export const YearPicker = forwardRef<YearPickerHandle, YearPickerProps>(
  (
    {
      value,
      onChange,
      defaultScale,
      onScaleChange: _onScaleChange, // eslint-disable-line @typescript-eslint/no-unused-vars
      min = DEFAULT_MIN,
      max = DEFAULT_MAX,
      className,
      valueIsCommitted = false,
    },
    ref,
  ) => {
    const t = useTranslations('game');
    const clampedValue = clamp(value === 0 ? 1 : value, min === 0 ? 1 : min, max);

    const deriveState = useCallback((year: number) => {
      const c = yearToCentury(year);
      const decades = decadesForCentury(c, min, max);
      const rawDecade = Math.floor(year / 10) * 10;
      const selDec = decades.includes(rawDecade) ? rawDecade : (decades[Math.floor(decades.length / 2)] ?? rawDecade);
      const years = yearsForDecade(selDec, min, max);
      const selYr = years.includes(year) ? year : (years[Math.floor(years.length / 2)] ?? year);
      return { selCentury: c, selDecade: selDec, selYear: selYr };
    }, [min, max]);

    const init = deriveState(clampedValue);
    const [selCentury, setSelCentury] = useState(init.selCentury);
    const [selDecade, setSelDecade] = useState(init.selDecade);
    const [selYear, setSelYear] = useState(init.selYear);

    const prevValueRef = useRef(clampedValue);

    useEffect(() => {
      if (value === prevValueRef.current) return;
      prevValueRef.current = value;
      const clamped = clamp(value === 0 ? 1 : value, min === 0 ? 1 : min, max);
      const derived = deriveState(clamped);
      setSelCentury(derived.selCentury);
      setSelDecade(derived.selDecade);
      setSelYear(derived.selYear);
    }, [value, min, max, deriveState]);

    const centuries = centuriesInRange(min, max);
    const decades = decadesForCentury(selCentury, min, max);
    const years = yearsForDecade(selDecade, min, max);

    const onChangeRef = useRef(onChange);
    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

    const handleCenturySelect = useCallback((c: number) => {
      const newDecades = decadesForCentury(c, min, max);
      const midDecade = newDecades[Math.floor(newDecades.length / 2)] ?? newDecades[0];
      if (midDecade === undefined) return;
      const newYears = yearsForDecade(midDecade, min, max);
      const midYear = newYears[Math.floor(newYears.length / 2)] ?? newYears[0];
      if (midYear === undefined) return;
      setSelCentury(c);
      setSelDecade(midDecade);
      setSelYear(midYear);
      onChangeRef.current(midYear);
    }, [min, max]);

    const handleDecadeSelect = useCallback((d: number) => {
      const newYears = yearsForDecade(d, min, max);
      const preserved = newYears.includes(selYear) ? selYear : (newYears[Math.floor(newYears.length / 2)] ?? newYears[0]);
      if (preserved === undefined) return;
      setSelDecade(d);
      setSelYear(preserved);
      onChangeRef.current(preserved);
    }, [min, max, selYear]);

    const handleYearSelect = useCallback((y: number) => {
      setSelYear(y);
      onChangeRef.current(y);
    }, []);

    useImperativeHandle(ref, () => ({
      centerOn: (year: number) => {
        const clamped = clamp(year === 0 ? 1 : year, min === 0 ? 1 : min, max);
        const derived = deriveState(clamped);
        setSelCentury(derived.selCentury);
        setSelDecade(derived.selDecade);
        setSelYear(derived.selYear);
        onChangeRef.current(derived.selYear);
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      setScale: (_scale: YearPickerScale) => { /* no-op: all tiers always visible */ },
    }), [min, max, deriveState]);

    void defaultScale;

    return (
      <div className={cn('flex flex-col gap-3', className)} style={{ userSelect: 'none' }}>
        <Rail
          items={centuries}
          selected={selCentury}
          itemWidth={CENTURY_W}
          labelFn={(v) => centuryLabel(v, t)}
          onSelect={handleCenturySelect}
          tierLabel={t('tier_century_label')}
        />
        <Rail
          items={decades}
          selected={selDecade}
          itemWidth={DECADE_W}
          labelFn={(v) => decadeLabel(v, t)}
          onSelect={handleDecadeSelect}
          tierLabel={t('tier_decade_label')}
        />
        <Rail
          items={years}
          selected={selYear}
          itemWidth={YEAR_W}
          labelFn={(v) => yearLabel(v, t)}
          onSelect={handleYearSelect}
          committed={valueIsCommitted}
          tierLabel={t('tier_year_label')}
        />
      </div>
    );
  },
);

YearPicker.displayName = 'YearPicker';
export type { YearPickerHandle };
