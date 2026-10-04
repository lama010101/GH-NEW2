import { useEffect, useRef, useState } from "react";
import { getAccuracyColor } from "@/core/accuracyColor";

interface RainbowRingProps {
  value: number;
  onComplete?: () => void;
  // HJ-FIX-RESULTRING-033 — optional, additive props. When both are omitted
  // the component renders byte-for-byte as before for every existing caller
  // (RoundCompleteSection, SessionComplete practice path, prototype/final-results).
  // thresholdPct draws a pass-mark notch across the ring stroke at
  // thresholdPct * 3.6 degrees from the ring's 12-o'clock start.
  thresholdPct?: number;
  // valueDecimals renders the centre number with that many decimals instead
  // of the integer count-up target (journey ring shows exact accuracy, e.g. 50.2).
  valueDecimals?: number;
}

/**
 * HJ-FIX-RESULTRING-033 — display invariant for the journey result ring.
 * The pass/fail verdict is computed server-side on the RAW accuracy; the ring
 * shows the accuracy to ONE decimal and the pass mark to one decimal (when not
 * an integer). Rounding to one decimal can make the shown number appear to
 * contradict the verdict (e.g. raw 49.96 failing a 50 mark would render 50.0).
 * This pure helper is the single rule that keeps the display consistent:
 *   - passed  → shown accuracy is never below the shown mark
 *   - failed  → shown accuracy is always strictly below the shown mark
 * Never uses Math.ceil/floor on the happy path — plain to-tenth rounding only.
 */
export function journeyResultDisplay(
  accuracyPct: number,
  minAccuracyPct: number,
  gatePassed: boolean,
): { accuracyPct: number; markPct: number } {
  const toTenth = (n: number) => Math.round(n * 10) / 10;
  const markPct = toTenth(minAccuracyPct);
  let accuracy = toTenth(accuracyPct);
  if (gatePassed) {
    if (accuracy < markPct) accuracy = markPct;
  } else if (accuracy >= markPct) {
    accuracy = Math.min(Math.floor(accuracyPct * 10) / 10, toTenth(markPct - 0.1));
  }
  return { accuracyPct: accuracy, markPct };
}

export default function RainbowRing({ value, onComplete, thresholdPct, valueDecimals }: RainbowRingProps) {
  const r = 80;
  const cx = 100;
  const cy = 100;
  const strokeWidth = 15;
  const circumference = 2 * Math.PI * r;

  const [displayed, setDisplayed] = useState(0);
  const hasCompletedRef = useRef(false);
  const hasAnimatedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (value <= 0) {
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onCompleteRef.current?.();
      }
      return;
    }
    if (hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;

    const steps = Math.round(value);
    const totalDuration = 900; // ms
    const stepDuration = totalDuration / steps;

    // Reset completion flag when target value changes
    hasCompletedRef.current = false;

    // Build haptic pattern: 10ms vibration, 10ms gap per step
    // navigator.vibrate accepts [vibrate, pause, vibrate, pause, ...]
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      const pattern: number[] = [];
      for (let i = 0; i < steps; i++) {
        pattern.push(10);  // vibrate 10ms
        if (i < steps - 1) pattern.push(Math.max(0, Math.round(stepDuration) - 10)); // gap
      }
      navigator.vibrate(pattern);
    }

    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      setDisplayed(current);
      if (current >= steps) {
        clearInterval(interval);
        // Snap to the exact value so a decimal display shows it precisely.
        if (valueDecimals != null) setDisplayed(value);
        // Trigger onComplete exactly once when animation completes
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true;
          onCompleteRef.current?.();
        }
      }
    }, stepDuration);

    return () => {
      clearInterval(interval);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(0); // cancel haptic on unmount
      }
    };
  }, [value, valueDecimals]);

  const clamped = Math.max(0, Math.min(100, displayed));
  const offset = circumference * (1 - clamped / 100);
  const color = getAccuracyColor(value);

  // Pass-mark notch geometry: a tick across the stroke at
  // thresholdPct * 3.6 degrees measured clockwise from the ring's start
  // (top, -90deg). Only rendered when thresholdPct is provided.
  const hasThreshold = thresholdPct != null;
  const thresholdAngle = ((thresholdPct ?? 0) * 3.6 - 90) * (Math.PI / 180);
  const tickInner = r - strokeWidth / 2 - 3;
  const tickOuter = r + strokeWidth / 2 + 3;

  return (
    <div style={{ position: "relative", width: 170, height: 170, margin: "0 auto" }}>
      <svg viewBox="0 0 200 200" style={{ width: 170, height: 170, display: "block" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--gh-border-medium)" strokeWidth={strokeWidth} />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        {hasThreshold && (
          <line
            x1={cx + tickInner * Math.cos(thresholdAngle)}
            y1={cy + tickInner * Math.sin(thresholdAngle)}
            x2={cx + tickOuter * Math.cos(thresholdAngle)}
            y2={cy + tickOuter * Math.sin(thresholdAngle)}
            stroke="var(--gh-text-primary)"
            strokeWidth={4}
            strokeLinecap="round"
          />
        )}
      </svg>
      <span
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          color: "var(--gh-text-primary)",
          fontSize: 52,
          fontWeight: "bold",
          lineHeight: 1,
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        {valueDecimals == null ? clamped : clamped.toFixed(valueDecimals)}
      </span>
    </div>
  );
}
