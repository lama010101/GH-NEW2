"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/**
 * Image-backed era/region button used in both Compete lobby and Practice settings.
 *
 * Renders a square button with a full-bleed image and label overlaid at the bottom.
 * Falls back: DB url → stock image → emoji.
 */

interface ImageButtonProps {
  label: string;
  sublabel?: string;
  dbUrl?: string;
  stockImg: string;
  emoji: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** CSS module class for the button element */
  className: string;
  /** CSS module class for selected state */
  onClassName: string;
  /** CSS module class for deselected state */
  offClassName: string;
  /** CSS module class for the image element */
  imgClassName: string;
  /** CSS module class for the overlay element */
  overlayClassName: string;
  /** CSS module class for the fallback (emoji) element */
  fallbackClassName: string;
  /** CSS module class for the caption container */
  captionClassName: string;
  /** CSS module class for the label text */
  labelClassName: string;
  /** CSS module class for the sublabel text (era span) */
  sublabelClassName: string;
}

export function ImageButton({
  label,
  sublabel,
  dbUrl,
  stockImg,
  emoji,
  selected,
  disabled,
  onClick,
  className,
  onClassName,
  offClassName,
  imgClassName,
  overlayClassName,
  fallbackClassName,
  captionClassName,
  labelClassName,
  sublabelClassName,
}: ImageButtonProps) {
  const [src, setSrc] = useState<string | null>(dbUrl ?? stockImg ?? null);

  useEffect(() => {
    setSrc(dbUrl ?? stockImg ?? null);
  }, [dbUrl, stockImg]);

  return (
    <button
      type="button"
      data-era={label}
      className={`${className} ${selected ? onClassName : offClassName}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
    >
      {src ? (
        src.startsWith("data:") ? (
          // Data URIs bypass next/image optimizer (unsupported as remote src).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={label}
            className={imgClassName}
            loading="lazy"
            onError={() => {
              if (src !== stockImg) setSrc(stockImg);
              else setSrc(null);
            }}
          />
        ) : (
          <Image
            src={src}
            alt={label}
            fill
            sizes="80px"
            quality={60}
            className={imgClassName}
            onError={() => {
              if (src !== stockImg) setSrc(stockImg);
              else setSrc(null);
            }}
          />
        )
      ) : (
        <div className={fallbackClassName}>{emoji}</div>
      )}
      <div className={overlayClassName} />
      <div className={captionClassName}>
        <span className={labelClassName}>{label}</span>
        {sublabel && <span className={sublabelClassName}>{sublabel}</span>}
      </div>
    </button>
  );
}
