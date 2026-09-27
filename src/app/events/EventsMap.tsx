"use client";

import dynamic from "next/dynamic";
import type { EventsMapMarker } from "./EventsMapLeaflet";
import styles from "./events.module.css";

const EventsMapLeaflet = dynamic(() => import("./EventsMapLeaflet"), {
  ssr: false,
  loading: () => <div className={styles.mapPlaceholder} />,
});

export function EventsMap(props: {
  markers: EventsMapMarker[];
  height?: number;
  linkMarkers?: boolean;
}) {
  return (
    <div className={styles.mapWrap}>
      <EventsMapLeaflet {...props} />
    </div>
  );
}
