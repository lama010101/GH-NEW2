"use client";

import { useState } from "react";
import styles from "./events.module.css";

export function PerPageSlider({ value, max }: { value: number; max: number }) {
  const [v, setV] = useState(value);
  return (
    <label className={styles.perSlider}>
      <input
        type="range"
        name="per"
        min={1}
        max={max}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        className={styles.perSliderInput}
        aria-label="Events per page"
      />
      <span className={styles.perSliderValue}>{v} per page</span>
    </label>
  );
}
