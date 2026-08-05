import { useEffect, useRef, useState } from "react";
import { getAccuracyColor } from "@/core/accuracyColor";

interface RainbowRingProps {
  value: number;
  onComplete?: () => void;
}

export default function RainbowRing({ value, onComplete }: RainbowRingProps) {
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

  return (
    <svg viewBox="0 0 200 200" style={{ width: 170, height: 170, display: "block", margin: "0 auto" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--gh-border-medium)" strokeWidth={strokeWidth} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="var(--gh-text-primary)" fontSize={52} fontWeight="bold">
        <tspan>{clamped}</tspan>
      </text>
    </svg>
  );
}
