import { useEffect, useRef, useState } from "react";
import { getAccuracyColor } from "@/core/accuracyColor";

interface RainbowRingProps {
  value: number;
  onComplete?: () => void;
  // HJ-FIX-RESULTRING-033 — optional, additive props. When both are omitted
  // the component renders byte-for-byte as before for every existing caller
  // (RoundCompleteSection, SessionComplete practice path, prototype/final-results).
  // thresholdPct draws a pass-mark notch across the ring stroke at
  // thresholdPct * 3.6 degrees from the ring's 12-o'clock start, plus a small
  // flag label showing the mark as a whole integer (HJ-UI-POLISH-035).
  thresholdPct?: number;
  // thresholdPassed colors the notch + flag by the server verdict:
  // true → green (--gh-success), false → red (--gh-danger). Defaults to the
  // neutral --gh-text-primary used before this prop existed.
  thresholdPassed?: boolean;
}

/**
 * HJ-UI-POLISH-STAGELIST-RESULT-035 — display invariant for the journey
 * result screen. The pass/fail verdict is computed server-side on the RAW
 * accuracy; every user-facing number is a WHOLE INTEGER. Rounding to an
 * integer can make the shown number appear to contradict the verdict (e.g.
 * raw 49.6 failing a 50 mark would render "50" next to a "not passed"
 * label). This pure helper is the single rule that keeps the display
 * consistent:
 *   - passed  → shown accuracy is never below the shown mark
 *   - failed  → shown accuracy is always strictly below the shown mark
 *     (raw 49.6 fails → shown as "49", never "50")
 * marginPts is derived from the SHOWN values so the status line, the ring
 * number and the flag can never disagree (failed ⇒ always ≥ 1 pt).
 */
export function journeyResultDisplay(
  accuracyPct: number,
  minAccuracyPct: number,
  gatePassed: boolean,
): { accuracyPct: number; markPct: number; marginPts: number } {
  const markPct = Math.round(minAccuracyPct);
  let shown = Math.round(accuracyPct);
  if (gatePassed) {
    if (shown < markPct) shown = markPct;
  } else {
    // raw < mark ⇒ floor(raw) is already below the mark in the common case;
    // the min() covers "raw 50.3 fails a 50.4 mark" where floor(raw) = markPct.
    shown = Math.min(Math.floor(accuracyPct), markPct - 1);
  }
  const marginPts = gatePassed ? shown - markPct : markPct - shown;
  return { accuracyPct: shown, markPct, marginPts };
}

export default function RainbowRing({ value, onComplete, thresholdPct, thresholdPassed }: RainbowRingProps) {
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

    // prefers-reduced-motion: snap straight to the final value — no count-up,
    // no haptic pattern. The final displayed value is the same integer.
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setDisplayed(value);
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onCompleteRef.current?.();
      }
      return;
    }

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
  }, [value]);

  const clamped = Math.max(0, Math.min(100, displayed));
  const offset = circumference * (1 - clamped / 100);
  const color = getAccuracyColor(value);

  // Pass-mark notch geometry: a tick across the stroke at
  // thresholdPct * 3.6 degrees measured clockwise from the ring's start
  // (top, -90deg), plus a small flag label just inside the stroke showing
  // the mark as a whole integer. Only rendered when thresholdPct is provided.
  const hasThreshold = thresholdPct != null;
  const thresholdAngle = ((thresholdPct ?? 0) * 3.6 - 90) * (Math.PI / 180);
  const tickInner = r - strokeWidth / 2 - 3;
  const tickOuter = r + strokeWidth / 2 + 3;
  const thresholdColor =
    thresholdPassed == null
      ? "var(--gh-text-primary)"
      : thresholdPassed
        ? "var(--gh-success)"
        : "var(--gh-danger)";
  const flagR = r - strokeWidth / 2 - 17;
  const flagX = cx + flagR * Math.cos(thresholdAngle);
  const flagY = cy + flagR * Math.sin(thresholdAngle);

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
          <>
            <line
              x1={cx + tickInner * Math.cos(thresholdAngle)}
              y1={cy + tickInner * Math.sin(thresholdAngle)}
              x2={cx + tickOuter * Math.cos(thresholdAngle)}
              y2={cy + tickOuter * Math.sin(thresholdAngle)}
              stroke={thresholdColor}
              strokeWidth={5}
              strokeLinecap="round"
            />
            <g aria-hidden="true">
              <rect
                x={flagX - 17}
                y={flagY - 10}
                width={34}
                height={20}
                rx={10}
                fill={thresholdColor}
              />
              <text
                x={flagX}
                y={flagY}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#ffffff"
                stroke="rgba(0,0,0,0.35)"
                strokeWidth={2}
                paintOrder="stroke"
                fontSize={12}
                fontWeight={800}
              >
                {Math.round(thresholdPct ?? 0)}
              </text>
            </g>
          </>
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
        {Math.round(clamped)}
      </span>
    </div>
  );
}
