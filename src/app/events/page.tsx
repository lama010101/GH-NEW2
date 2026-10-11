import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { fetchSeoEventsPage, fetchSeoEventsFilterMeta } from "@/server/seoEvents";
import { SITE_URL } from "@/server/seoConfig";
import { defaultLocale, LOCALE_COOKIE, locales, type Locale } from "@/i18n/config";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { EventCard } from "./EventCard";
import { EventsThemeToggle } from "./EventsThemeToggle";
import { EventsSearchPanel } from "./EventsSearchPanel";
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
  const t = await getTranslations("events");
  const page = Math.max(Number(searchParams.page) || 1, 1);
  const title = page > 1 ? t("meta_title_page", { page }) : t("meta_title");
  const description = t("meta_desc");
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

  const t = await getTranslations("events");
  const tNav = await getTranslations("nav");
  const cookieStore = await cookies();
  const rawLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale =
    rawLocale && (locales as readonly string[]).includes(rawLocale)
      ? (rawLocale as Locale)
      : defaultLocale;

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
          <Link href="/">{tNav("home")}</Link>
          <span>/</span>
          <span className={styles.breadcrumbCurrent}>{t("breadcrumb")}</span>
          <span className={styles.breadcrumbToggle}>
            <LanguageSwitcher initialLocale={locale} />
            <EventsThemeToggle />
          </span>
        </nav>

        <section className={styles.hero}>
          <p className={styles.heroKicker}>{t("kicker")}</p>
          <h1 className={styles.heroTitle}>{t("hero_title")}</h1>
          <p className={styles.heroSubtitle}>{t("hero_subtitle")}</p>
        </section>

        {filterMeta.minYear !== null && filterMeta.maxYear !== null ? (
          <EventsSearchPanel
            q={q}
            sort={sort}
            continent={continent}
            theme={theme}
            per={per}
            yearFrom={yearFrom}
            yearTo={yearTo}
            continents={filterMeta.continents}
            themes={filterMeta.themes}
            minYear={filterMeta.minYear}
            maxYear={filterMeta.maxYear}
            total={total}
            markers={events.map((e) => ({
              slug: e.slug,
              title: e.title,
              year: e.year,
              lat: e.lat,
              lng: e.lng,
            }))}
          />
        ) : null}

        <p className={styles.resultCount}>{t("results", { total })}</p>

        {events.length === 0 ? (
          <p className={styles.pageSubtitle}>{t("empty")}</p>
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
              {t("prev")}
            </Link>
          ) : null}
          <span className={styles.pageStatus}>
            {t("page_status", { page, totalPages })}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className={styles.pageLink}>
              {t("next")}
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
