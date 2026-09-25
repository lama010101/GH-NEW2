import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchSeoEventBySlug, fetchRelatedSeoEvents, fetchAllEligibleSlugs } from "@/server/seoEvents";
import { SITE_URL } from "@/server/seoConfig";
import { EventCard } from "../EventCard";
import styles from "../events.module.css";

export const revalidate = 3600;

type EventPageProps = {
  params: { slug: string };
};

// Pre-render every currently-eligible event at build time; any event added
// later (or newly eligible) is rendered on first request and cached (ISR).
export async function generateStaticParams() {
  const slugs = await fetchAllEligibleSlugs();
  return slugs.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const event = await fetchSeoEventBySlug(params.slug);
  if (!event) {
    return { title: "Event not found | Guess History" };
  }

  const place = event.location.name || event.location.country || "an unknown location";
  const title = `${event.title} (${event.year}) | Guess History`;
  const description = truncate(
    event.description || `${event.title} — ${event.year}, ${place}. Learn the story behind this historical event.`,
    160
  );
  const canonical = `${SITE_URL}/events/${event.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "article",
      images: event.imageUrl ? [{ url: event.imageUrl }] : undefined,
    },
    twitter: {
      card: event.imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: event.imageUrl ? [event.imageUrl] : undefined,
    },
  };
}

function truncate(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export default async function EventDetailPage({ params }: EventPageProps) {
  const event = await fetchSeoEventBySlug(params.slug);
  if (!event) {
    notFound();
  }

  const related = await fetchRelatedSeoEvents(event, 4);
  const place = event.location.name || event.location.country || "Unknown location";
  const canonical = `${SITE_URL}/events/${event.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description,
    startDate: String(event.year),
    url: canonical,
    ...(event.imageUrl ? { image: [event.imageUrl] } : {}),
    location: {
      "@type": "Place",
      name: place,
      ...(Number.isFinite(event.location.lat) && Number.isFinite(event.location.lng)
        ? {
            geo: {
              "@type": "GeoCoordinates",
              latitude: event.location.lat,
              longitude: event.location.lng,
            },
          }
        : {}),
    },
    ...(event.category ? { about: event.category } : {}),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Events", item: `${SITE_URL}/events` },
      { "@type": "ListItem", position: 3, name: event.title, item: canonical },
    ],
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        {/* eslint-disable-next-line react/no-danger -- static JSON-LD, no user input rendered as HTML */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* eslint-disable-next-line react/no-danger -- static JSON-LD, no user input rendered as HTML */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
        />

        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>/</span>
          <Link href="/events">Events</Link>
          <span>/</span>
          <span className={styles.breadcrumbCurrent}>{event.title}</span>
        </nav>

        {event.imageUrl ? (
          <div className={styles.heroImageWrap}>
            <Image
              src={event.imageUrl}
              alt={event.title}
              fill
              priority
              sizes="(max-width: 960px) 100vw, 960px"
              className={styles.heroImage}
            />
          </div>
        ) : null}

        <h1 className={styles.pageTitle}>{event.title}</h1>

        <div className={styles.metaRow}>
          <span className={styles.metaPill}>{event.year}</span>
          <span className={styles.metaPill}>{place}</span>
          {event.category ? <span className={styles.metaPill}>{event.category}</span> : null}
        </div>

        <p className={styles.body}>{event.description}</p>

        <div className={styles.cta}>
          <div className={styles.ctaText}>
            <p className={styles.ctaTitle}>Think you can place it on the map and the timeline?</p>
            <p className={styles.ctaSubtitle}>
              Play Guess History and test your knowledge of real events like this one.
            </p>
          </div>
          <Link href="/home" className={styles.ctaButton}>
            Play Guess History
          </Link>
        </div>

        {related.length > 0 ? (
          <section>
            <h2 className={styles.sectionTitle}>Related events</h2>
            <div className={styles.relatedGrid}>
              {related.map((r) => (
                <EventCard key={r.slug} event={r} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
