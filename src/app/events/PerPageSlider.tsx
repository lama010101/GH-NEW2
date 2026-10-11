"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import styles from "./events.module.css";

export function PerPageSlider({ value, max }: { value: number; max: number }) {
  const t = useTranslations("events");
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
        aria-label={t("per_page_aria")}
      />
      <span className={styles.perSliderValue}>{t("events_count", { count: v })}</span>
    </label>
  );
}
