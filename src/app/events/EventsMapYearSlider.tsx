"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { EventsMapMarker } from "./EventsMapLeaflet";
import styles from "./events.module.css";

const EventsMapLeaflet = dynamic(() => import("./EventsMapLeaflet"), {
  ssr: false,
  loading: () => <div className={styles.mapPlaceholder} />,
});

function formatYear(y: number): string {
  return y < 0 ? `${-y} BC` : `${y}`;
}

export function EventsMapYearSlider({
  markers,
  minYear,
  maxYear,
  initialFrom,
  initialTo,
}: {
  markers: EventsMapMarker[];
  minYear: number;
  maxYear: number;
  initialFrom: number;
  initialTo: number;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const shown = markers.filter((m) => m.year >= from && m.year <= to);
  const isFullRange = from <= minYear && to >= maxYear;

  return (
    <div>
      <div className={styles.mapWrap}>
        <EventsMapLeaflet markers={shown} />
      </div>
      <div className={styles.yearSliderBar}>
        <div className={styles.yearSliderLabels}>
          <span>{formatYear(from)}</span>
          <span>
            {shown.length} event{shown.length === 1 ? "" : "s"} on map
          </span>
          <span>{formatYear(to)}</span>
        </div>
        <div className={styles.yearSliderTrackWrap}>
          <div
            className={styles.yearSliderFill}
            style={{
              left: `${((from - minYear) / (maxYear - minYear)) * 100}%`,
              width: `${((to - from) / (maxYear - minYear)) * 100}%`,
            }}
          />
          <input
            type="range"
            min={minYear}
            max={maxYear}
            value={from}
            onChange={(e) => setFrom(Math.min(Number(e.target.value), to))}
            className={styles.yearSliderInput}
            aria-label="From year"
          />
          <input
            type="range"
            min={minYear}
            max={maxYear}
            value={to}
            onChange={(e) => setTo(Math.max(Number(e.target.value), from))}
            className={styles.yearSliderInput}
            aria-label="To year"
          />
        </div>
        {!isFullRange ? (
          <>
            <input type="hidden" name="yf" value={from} form="events-filter" />
            <input type="hidden" name="yt" value={to} form="events-filter" />
          </>
        ) : null}
      </div>
    </div>
  );
}
