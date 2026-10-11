"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { EventsMapMarker } from "./EventsMapLeaflet";
import { EventsMap } from "./EventsMap";
import { PerPageSlider } from "./PerPageSlider";
import styles from "./events.module.css";

function formatYear(y: number): string {
  return y < 0 ? `${-y} BC` : `${y}`;
}

export function EventsSearchPanel({
  q,
  sort,
  continent,
  theme,
  per,
  yearFrom,
  yearTo,
  continents,
  themes,
  minYear,
  maxYear,
  total,
  markers,
}: {
  q: string;
  sort: string;
  continent: string;
  theme: string;
  per: number;
  yearFrom?: number;
  yearTo?: number;
  continents: string[];
  themes: string[];
  minYear: number;
  maxYear: number;
  total: number;
  markers: EventsMapMarker[];
}) {
  const [from, setFrom] = useState(yearFrom ?? maxYear - 50);
  const [to, setTo] = useState(yearTo ?? maxYear);
  const [expanded, setExpanded] = useState(
    sort !== "newest" ||
      continent !== "" ||
      theme !== "" ||
      per !== 24 ||
      yearFrom !== undefined ||
      yearTo !== undefined
  );
  const t = useTranslations("events");
  const shown = markers.filter((m) => m.year >= from && m.year <= to);
  const isFullRange = from <= minYear && to >= maxYear;

  return (
    <section className={styles.searchModule} aria-label={t("search_title")}>
      <div className={styles.searchModuleHead}>
        <span className={styles.searchModuleTitle}>{t("search_title")}</span>
        <span className={styles.searchModuleCount}>
          {t("map_count", { shown: shown.length, total: markers.length })}
        </span>
      </div>

      <form action="/events" method="get" id="events-filter" className={styles.searchForm}>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t("search_placeholder")}
          className={styles.searchInput}
          aria-label={t("search_aria")}
        />

        <div className={styles.searchActions}>
          <button type="submit" className={styles.filterApply}>
            {t("apply")}
          </button>
          <button
            type="button"
            className={styles.filterExpandBtn}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? `${t("fewer_filters")} ▴` : `${t("more_filters")} ▾`}
          </button>
          <Link href="/events" className={styles.filterReset}>
            {t("reset")}
          </Link>
        </div>

        {expanded ? (
          <>
            <div className={styles.searchRow}>
              <select
                name="sort"
                defaultValue={sort}
                className={styles.searchSelect}
                aria-label={t("sort_aria")}
              >
                <option value="newest">{t("sort_newest")}</option>
                <option value="oldest">{t("sort_oldest")}</option>
              </select>
              <select
                name="continent"
                defaultValue={continent}
                className={styles.searchSelect}
                aria-label={t("continent_aria")}
              >
                <option value="">{t("all_continents")}</option>
                {continents.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                name="theme"
                defaultValue={theme}
                className={styles.searchSelect}
                aria-label={t("theme_aria")}
              >
                <option value="">{t("all_themes")}</option>
                {themes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.searchRow}>
              <div className={styles.sliderField}>
                <span className={styles.sliderFieldLabel}>{t("max_events")}</span>
                <PerPageSlider value={per} max={Math.max(total, 1)} />
              </div>
              <div className={styles.sliderField}>
                <span className={styles.sliderFieldLabel}>
                  {t("year_range")}
                  <span className={styles.sliderFieldValue}>
                    {formatYear(from)} – {formatYear(to)}
                  </span>
                </span>
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
                    aria-label={t("from_year_aria")}
                  />
                  <input
                    type="range"
                    min={minYear}
                    max={maxYear}
                    value={to}
                    onChange={(e) => setTo(Math.max(Number(e.target.value), from))}
                    className={styles.yearSliderInput}
                    aria-label={t("to_year_aria")}
                  />
                </div>
              </div>
            </div>
          </>
        ) : null}

        {!isFullRange ? (
          <>
            <input type="hidden" name="yf" value={from} />
            <input type="hidden" name="yt" value={to} />
          </>
        ) : null}
      </form>

      {markers.length > 0 ? <EventsMap markers={shown} /> : null}
    </section>
  );
}
