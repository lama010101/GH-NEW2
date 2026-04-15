import type { EventRecord } from "./types";

export type PreloadedImage = {
  eventId: string;
  imageUrl: string | null;
  imageElement: HTMLImageElement;
  isLoaded: boolean;
  error: Error | null;
};

const preloadedCache = new Map<string, PreloadedImage>();

export function getPreloadedImage(eventId: string): PreloadedImage | undefined {
  return preloadedCache.get(eventId);
}

export function preloadEventImage(event: EventRecord): Promise<PreloadedImage> {
  const cached = preloadedCache.get(event.id);
  if (cached) {
    return Promise.resolve(cached);
  }

  if (!event.imageUrl) {
    const noImageResult: PreloadedImage = {
      eventId: event.id,
      imageUrl: "",
      imageElement: new Image(),
      isLoaded: true,
      error: null
    };
    preloadedCache.set(event.id, noImageResult);
    return Promise.resolve(noImageResult);
  }

  return new Promise((resolve) => {
    const img = new Image();
    const result: PreloadedImage = {
      eventId: event.id,
      imageUrl: event.imageUrl,
      imageElement: img,
      isLoaded: false,
      error: null
    };

    img.onload = () => {
      result.isLoaded = true;
      preloadedCache.set(event.id, result);
      resolve(result);
    };

    img.onerror = () => {
      result.error = new Error(`Failed to load image: ${event.imageUrl ?? "unknown"}`);
      result.isLoaded = true;
      preloadedCache.set(event.id, result);
      resolve(result);
    };

    if (event.imageUrl) {
      img.src = event.imageUrl;
    } else {
      result.isLoaded = true;
      preloadedCache.set(event.id, result);
      resolve(result);
    }
  });
}

export function preloadNextRoundImage(events: EventRecord[], currentRoundIndex: number): void {
  const nextRoundIndex = currentRoundIndex + 1;
  if (nextRoundIndex >= events.length) {
    return;
  }

  const nextEvent = events[nextRoundIndex];
  if (!nextEvent?.imageUrl) {
    return;
  }

  const cached = preloadedCache.get(nextEvent.id);
  if (cached?.isLoaded) {
    return;
  }

  void preloadEventImage(nextEvent).then((result) => {
    if (result.error) {
      console.warn(`[Preload] Failed to preload image for round ${nextRoundIndex}:`, result.error.message);
    } else {
      console.log(`[Preload] Successfully preloaded image for round ${nextRoundIndex}`);
    }
  });
}

export function clearPreloadCache(): void {
  preloadedCache.clear();
}
