import type { Metadata } from "next";
import Link from "next/link";
import { fetchSeoEventsPage, fetchSeoEventsFilterMeta } from "@/server/seoEvents";
import { SITE_URL } from "@/server/seoConfig";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { EventCard } from "./EventCard";
import { EventsMapYearSlider } from "./EventsMapYearSlider";
import { PerPageSlider } from "./PerPageSlider";
import styles from "./events.module.css";

export const revalidate = 3600;

type EventsIndexProps = {
  searchParams: {
    page?: string;
    q?: string;
    sort?: string;
    yf?: string;
    yt?: string;
    continent?: string;
    theme?: string;
    per?: string;
  };
};

function parseYear(value: string | undefined): number | undefined {
  const n = Number(value);
  return value && Number.isFinite(n) ? Math.trunc(n) : undefined;
}

export async function generateMetadata({ searchParams }: EventsIndexProps): Promise<Metadata> {
  const page = Math.max(Number(searchParams.page) || 1, 1);
  const title =
    page > 1
      ? `Historical Events — Page ${page} | Guess History`
      : "Historical Events Explained | Guess History";
  const description =
    "Browse real historical events with dates, locations and context — then test what you've learned in Guess History.";
  const canonical = page > 1 ? `${SITE_URL}/events?page=${page}` : `${SITE_URL}/events`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function EventsIndexPage({ searchParams }: EventsIndexProps) {
  const page = Math.max(Number(searchParams.page) || 1, 1);
  const q = searchParams.q?.trim() ?? "";
  const sort = searchParams.sort === "oldest" ? "oldest" : "newest";
  const yearFrom = parseYear(searchParams.yf);
  const yearTo = parseYear(searchParams.yt);
  const continent = searchParams.continent || "";
  const theme = searchParams.theme || "";
  const perRaw = Number(searchParams.per);
  const per = Number.isFinite(perRaw) && perRaw >= 1 ? Math.min(Math.trunc(perRaw), 2000) : 24;

  const [{ events, total, pageSize }, filterMeta] = await Promise.all([
    fetchSeoEventsPage({
      page,
      pageSize: per,
      q: q || undefined,
      sort,
      yearFrom,
      yearTo,
      continent: continent || undefined,
      theme: theme || undefined,
    }),
    fetchSeoEventsFilterMeta(),
  ]);
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  // Query string shared by pagination links so filters survive page changes.
  const filterParams = new URLSearchParams();
  if (q) filterParams.set("q", q);
  if (sort === "oldest") filterParams.set("sort", "oldest");
  if (yearFrom !== undefined) filterParams.set("yf", String(yearFrom));
  if (yearTo !== undefined) filterParams.set("yt", String(yearTo));
  if (continent) filterParams.set("continent", continent);
  if (theme) filterParams.set("theme", theme);
  if (per !== 24) filterParams.set("per", String(per));
  const pageHref = (p: number) => {
    const params = new URLSearchParams(filterParams);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/events?${qs}` : "/events";
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>/</span>
          <span className={styles.breadcrumbCurrent}>Events</span>
          <span className={styles.breadcrumbToggle}>
            <ThemeToggle />
          </span>
        </nav>

        <section className={styles.hero}>
          <p className={styles.heroKicker}>The Guess History archive</p>
          <h1 className={styles.heroTitle}>Every event has a place and a time.</h1>
          <p className={styles.heroSubtitle}>
            Browse real historical events — where they happened, when they happened, and
            why they mattered. Then guess them yourself in the game.
          </p>

          <form action="/events" method="get" className={styles.heroSearch}>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search events, places, themes…"
              className={styles.heroSearchInput}
              aria-label="Search events"
            />
            {sort === "oldest" ? <input type="hidden" name="sort" value="oldest" /> : null}
            {yearFrom !== undefined ? <input type="hidden" name="yf" value={yearFrom} /> : null}
            {yearTo !== undefined ? <input type="hidden" name="yt" value={yearTo} /> : null}
            {continent ? <input type="hidden" name="continent" value={continent} /> : null}
            {theme ? <input type="hidden" name="theme" value={theme} /> : null}
            {per !== 24 ? <input type="hidden" name="per" value={per} /> : null}
            <button type="submit" className={styles.heroSearchBtn}>
              Search
            </button>
          </form>

          <div className={styles.heroStats}>
            <span className={styles.heroStat}>{total.toLocaleString()} events</span>
            <span className={styles.heroStat}>{filterMeta.continents.length} continents</span>
            {filterMeta.minYear !== null && filterMeta.maxYear !== null ? (
              <span className={styles.heroStat}>
                {filterMeta.minYear < 0 ? `${-filterMeta.minYear} BC` : filterMeta.minYear} –{" "}
                {filterMeta.maxYear}
              </span>
            ) : null}
          </div>
        </section>

        <form action="/events" method="get" id="events-filter" className={styles.filterBar}>
          <span className={styles.filterLabel}>Refine</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search events…"
            className={styles.filterInput}
            aria-label="Search events"
          />
          <select name="sort" defaultValue={sort} className={styles.filterSelect} aria-label="Sort order">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <select
            name="continent"
            defaultValue={continent}
            className={styles.filterSelect}
            aria-label="Filter by continent"
          >
            <option value="">All continents</option>
            {filterMeta.continents.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            name="theme"
            defaultValue={theme}
            className={styles.filterSelect}
            aria-label="Filter by theme"
          >
            <option value="">All themes</option>
            {filterMeta.themes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <PerPageSlider value={per} max={Math.max(total, 1)} />
          <button type="submit" className={styles.filterApply}>
            Apply
          </button>
          <Link href="/events" className={styles.filterReset}>
            Reset
          </Link>
        </form>

        {events.length > 0 && filterMeta.minYear !== null && filterMeta.maxYear !== null ? (
          <EventsMapYearSlider
            markers={events.map((e) => ({
              slug: e.slug,
              title: e.title,
              year: e.year,
              lat: e.lat,
              lng: e.lng,
            }))}
            minYear={filterMeta.minYear}
            maxYear={filterMeta.maxYear}
            initialFrom={yearFrom ?? filterMeta.maxYear - 50}
            initialTo={yearTo ?? filterMeta.maxYear}
          />
        ) : null}

        <p className={styles.resultCount}>
          {total} event{total === 1 ? "" : "s"} found
        </p>

        {events.length === 0 ? (
          <p className={styles.pageSubtitle}>No events match — try widening your search or filters.</p>
        ) : (
          <div className={styles.grid}>
            {events.map((event) => (
              <EventCard key={event.slug} event={event} />
            ))}
          </div>
        )}

        <div className={styles.pagination}>
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={styles.pageLink}>
              ← Previous
            </Link>
          ) : null}
          <span className={styles.pageStatus}>
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className={styles.pageLink}>
              Next →
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
