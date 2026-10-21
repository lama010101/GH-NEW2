import Image from "next/image";
import Link from "next/link";
import styles from "./events.module.css";
import type { SeoEventSummary } from "@/server/seoEvents";

export function EventCard({ event }: { event: SeoEventSummary }) {
  const meta = [event.continent, event.category].filter(Boolean).join(" · ");
  return (
    <Link href={`/events/${event.slug}`} className={styles.card}>
      <div className={styles.cardImageWrap}>
        {event.imageUrl ? (
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            sizes="(max-width: 640px) 100vw, 240px"
            className={styles.cardImage}
          />
        ) : null}
        <span className={styles.cardYearBadge}>
          {event.year < 0 ? `${-event.year} BC` : event.year}
        </span>
      </div>
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>{event.title}</h3>
        {meta ? <div className={styles.cardMeta}>{meta}</div> : null}
      </div>
    </Link>
  );
}
