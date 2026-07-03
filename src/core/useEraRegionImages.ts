"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Era/region image map returned by /api/prototype/lobby-images.
 * Each value is a DB image URL (or undefined if no DB image exists).
 */
export type EraRegionImageMap = {
  eras: Partial<Record<string, string>>;
  regions: Partial<Record<string, string>>;
};

/**
 * Fetches representative DB event images for era/region buttons.
 * Falls back to local stock images when no DB image is available.
 *
 * Used by both Compete (LobbySection) and Practice (PracticeSettingsModal).
 */
export function useEraRegionImages(): {
  dbImages: EraRegionImageMap | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [dbImages, setDbImages] = useState<EraRegionImageMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function fetchImages() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/prototype/lobby-images");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as EraRegionImageMap;
        if (cancelled) return;
        setDbImages(data);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load images");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchImages();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { dbImages, loading, error, refresh };
}

/**
 * Stock image paths for each era/region id.
 * Used as fallback when no DB image is available.
 */
export const ERA_STOCK_IMAGES: Record<string, string> = {
  ancient: "/images/era-region/ancient.jpg",
  medieval: "/images/era-region/medieval.jpg",
  earlymodern: "/images/era-region/earlymodern.jpg",
  modern: "/images/era-region/modern.jpg",
  contemporary: "/images/era-region/contemporary.jpg",
};

export const REGION_STOCK_IMAGES: Record<string, string> = {
  africa: "/images/era-region/africa.jpg",
  asia: "/images/era-region/asia.jpg",
  europe: "/images/era-region/europe.jpg",
  north_america: "/images/era-region/north_america.jpg",
  south_america: "/images/era-region/south_america.jpg",
  oceania_antarctica: "/images/era-region/oceania_antarctica.jpg",
};
