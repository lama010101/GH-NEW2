"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type { EventsMapMarker } from "./EventsMapLeaflet";
import styles from "./events.module.css";

const EventsMapLeaflet = dynamic(() => import("./EventsMapLeaflet"), {
  ssr: false,
  loading: () => <div className={styles.mapPlaceholder} />,
});

export function EventsMap(props: {
  markers: EventsMapMarker[];
  height?: number | string;
  linkMarkers?: boolean;
  scrollWheelZoom?: boolean;
}) {
  const tNav = useTranslations("nav");
  const tEv = useTranslations("events");
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [fullscreen]);

  return (
    <div className={styles.mapWrap}>
      <button
        type="button"
        className={styles.mapExpandBtn}
        onClick={() => setFullscreen(true)}
        aria-label={tNav("enter_fullscreen")}
        title={tEv("map_fullscreen_aria")}
      >
        ⤢
      </button>
      <EventsMapLeaflet {...props} />
      {fullscreen && typeof document !== "undefined"
        ? createPortal(
            <div
              className={styles.mapLightbox}
              role="dialog"
              aria-modal="true"
              aria-label={tEv("map_fullscreen_aria")}
              onClick={() => setFullscreen(false)}
            >
              <button
                type="button"
                className={styles.lightboxClose}
                onClick={() => setFullscreen(false)}
                aria-label={tNav("close_fullscreen_view")}
              >
                ✕
              </button>
              <div className={styles.mapLightboxInner} onClick={(e) => e.stopPropagation()}>
                <EventsMapLeaflet
                  {...props}
                  height={Math.max(window.innerHeight - 96, 320)}
                  scrollWheelZoom
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
