"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import styles from "./events.module.css";

export function HeroImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={styles.heroImageWrap}
        onClick={() => setOpen(true)}
        aria-label={`View ${alt} fullscreen`}
      >
        <Image
          src={src}
          alt={alt}
          fill
          priority
          sizes="(max-width: 960px) 100vw, 960px"
          className={styles.heroImage}
        />
        <span className={styles.heroZoomHint}>⤢ Fullscreen</span>
      </button>

      {open ? (
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            className={styles.lightboxClose}
            onClick={() => setOpen(false)}
            aria-label="Close fullscreen view"
          >
            ✕
          </button>
          <div className={styles.lightboxImgWrap} onClick={(e) => e.stopPropagation()}>
            <Image src={src} alt={alt} fill sizes="100vw" className={styles.lightboxImg} />
          </div>
        </div>
      ) : null}
    </>
  );
}
