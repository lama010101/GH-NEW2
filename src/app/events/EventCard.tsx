import Image from "next/image";
import Link from "next/link";
import styles from "./events.module.css";
import type { SeoEventSummary } from "@/server/seoEvents";

export function EventCard({ event }: { event: SeoEventSummary }) {
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
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardYear}>{event.year}</div>
        <h3 className={styles.cardTitle}>{event.title}</h3>
        {event.category ? <div className={styles.cardMeta}>{event.category}</div> : null}
      </div>
    </Link>
  );
}
