import type { Metadata } from "next";
import Link from "next/link";
import { fetchSeoEventsPage } from "@/server/seoEvents";
import { SITE_URL } from "@/server/seoConfig";
import { EventCard } from "./EventCard";
import styles from "./events.module.css";

export const revalidate = 3600;

type EventsIndexProps = {
  searchParams: { page?: string };
};

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
  const { events, total, pageSize } = await fetchSeoEventsPage({ page });
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>/</span>
          <span className={styles.breadcrumbCurrent}>Events</span>
        </nav>

        <h1 className={styles.pageTitle}>Historical Events</h1>
        <p className={styles.pageSubtitle}>
          Real historical events with dates, locations and context. Pick one to read the
          full story, then guess it yourself in the game.
        </p>

        {events.length === 0 ? (
          <p className={styles.pageSubtitle}>No events available yet — check back soon.</p>
        ) : (
          <div className={styles.grid}>
            {events.map((event) => (
              <EventCard key={event.slug} event={event} />
            ))}
          </div>
        )}

        <div className={styles.pagination}>
          {page > 1 ? (
            <Link href={page === 2 ? "/events" : `/events?page=${page - 1}`} className={styles.pageLink}>
              ← Previous
            </Link>
          ) : null}
          <span className={styles.pageStatus}>
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={`/events?page=${page + 1}`} className={styles.pageLink}>
              Next →
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
