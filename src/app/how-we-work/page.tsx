import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { fetchImprovementStats, type ImprovementStats } from "@/server/improvementStats";
import { BRAND_NAME, SITE_ORIGIN } from "@/core/brand";
import { defaultLocale, LOCALE_COOKIE, locales, type Locale } from "@/i18n/config";
import BrandMark from "@/components/brand/BrandMark";
import { LanguageDropdown } from "@/components/layout/LanguageDropdown";
import { BackButton } from "./BackButton";
import styles from "./how-we-work.module.css";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("howWeWork");
  const title = t("meta_title");
  const description = t("meta_desc", { appName: BRAND_NAME });
  return {
    title,
    description,
    alternates: { canonical: `${SITE_ORIGIN}/how-we-work` },
    openGraph: { title, description, url: `${SITE_ORIGIN}/how-we-work`, type: "website" },
  };
}

export default async function HowWeWorkPage() {
  const t = await getTranslations("howWeWork");
  const tNav = await getTranslations("leaderboard");
  const appName = BRAND_NAME;

  const cookieStore = await cookies();
  const rawLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale =
    rawLocale && (locales as readonly string[]).includes(rawLocale)
      ? (rawLocale as Locale)
      : defaultLocale;

  // DB failure must never 500 the page: render the static sections and hide
  // the stats block instead.
  let stats: ImprovementStats | null = null;
  try {
    stats = await fetchImprovementStats();
  } catch (error) {
    console.warn(
      "[how-we-work] improvement stats unavailable",
      error instanceof Error ? error.message : error
    );
  }

  const numberFormat = new Intl.NumberFormat(locale);
  const percentFormat = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  });

  return (
    <>
      <header className={styles.topbar}>
        <BackButton label={tNav("back")} className={styles.backButton} />
        <Link href="/" className={styles.brand} aria-label={BRAND_NAME}>
          <BrandMark size={28} />
        </Link>
        <div className={styles.langSlot}>
          <LanguageDropdown initialLocale={locale} />
        </div>
      </header>
      <main className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.intro}>{t("intro", { appName })}</p>
        <p className={styles.body}>{t("ai_note")}</p>

        <h2 className={styles.sectionTitle}>{t("improve_title")}</h2>
        <ul className={styles.list}>
          <li>{t("improve_audit")}</li>
          <li>{t("improve_ai")}</li>
          <li>{t("improve_reports")}</li>
        </ul>

        <p className={styles.note}>{t("translation_note")}</p>
        <p className={styles.note}>{t("early_version")}</p>

        {stats && (
          <section className={styles.stats} aria-label={t("stats_title")}>
            <h2 className={styles.sectionTitle}>{t("stats_title")}</h2>
            <dl className={styles.statsGrid}>
              <div className={styles.stat}>
                <dt>{t("stat_events")}</dt>
                <dd>{numberFormat.format(stats.eventsInGame)}</dd>
              </div>
              <div className={styles.stat}>
                <dt>{t("stat_french")}</dt>
                <dd>
                  {stats.frenchCoverage === null
                    ? "—"
                    : percentFormat.format(stats.frenchCoverage)}
                </dd>
              </div>
              <div className={styles.stat}>
                <dt>{t("stat_ai_players")}</dt>
                <dd>{numberFormat.format(stats.activeAiPlayers)}</dd>
              </div>
              <div className={styles.stat}>
                <dt>{t("stat_daily")}</dt>
                <dd>{numberFormat.format(stats.dailyChallengesGenerated)}</dd>
              </div>
            </dl>
          </section>
        )}
      </div>
      </main>
    </>
  );
}
