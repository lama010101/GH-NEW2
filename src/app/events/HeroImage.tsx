"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import styles from "./events.module.css";

export function HeroImage({ src, alt }: { src: string; alt: string }) {
  const t = useTranslations("events");
  const tNav = useTranslations("nav");
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
        aria-label={t("image_fullscreen_aria", { title: alt })}
      >
        <Image
          src={src}
          alt={alt}
          fill
          priority
          sizes="(max-width: 960px) 100vw, 960px"
          className={styles.heroImage}
        />
        <span className={styles.heroZoomHint}>⤢ {tNav("enter_fullscreen")}</span>
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
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
                aria-label={tNav("close_fullscreen_view")}
              >
                ✕
              </button>
              <div className={styles.lightboxImgWrap} onClick={(e) => e.stopPropagation()}>
                <Image src={src} alt={alt} fill sizes="100vw" className={styles.lightboxImg} />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
