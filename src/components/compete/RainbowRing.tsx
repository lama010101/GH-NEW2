import { useEffect, useState } from "react";

interface RainbowRingProps {
  value: number;
}

export default function RainbowRing({ value }: RainbowRingProps) {
  const r = 80;
  const cx = 100;
  const cy = 100;
  const strokeWidth = 15;
  const circumference = 2 * Math.PI * r;

  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (value <= 0) {
      setDisplayed(0);
      return;
    }

    const steps = Math.round(value);
    const totalDuration = 900; // ms
    const stepDuration = totalDuration / steps;

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
      if (current >= steps) clearInterval(interval);
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
  const hue = Math.round((clamped / 100) * 120);
  const color = `hsl(${hue}, 100%, 50%)`;

  return (
    <svg viewBox="0 0 200 200" style={{ width: 170, height: 170, display: "block", margin: "0 auto" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a2a2a" strokeWidth={strokeWidth} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fill="white" fontSize={52} fontWeight="bold">
        {clamped}
      </text>
    </svg>
  );
}
