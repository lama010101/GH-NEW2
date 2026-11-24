// I18N-BUILD-GAMEOVERLAY-1124-865
//
// Server-side translation overlay for CompeteSessionSnapshot.rounds.
//
// The English snapshot built by getGameState already applies reveal gating:
// title/description/hints/imageUrl stay empty until ROUND_STARTED and
// answer fields (locationName, year, lat, lng) until ROUND_COMPLETE. This
// overlay runs AFTER that snapshot exists and only replaces text fields
// that are already non-empty in English — it can never un-gate content.
//
// lang null (or unresolvable upstream) => the same object is returned with
// zero queries. Empty translation maps (lang without rows, DB error) => a
// snapshot deep-equal to the input. The input is never mutated.

import type { CompeteSessionSnapshot } from "@/core/types";
import {
  fetchContentTranslations,
  overlayNullableText,
  overlayText,
} from "./contentTranslations";

/**
 * Return a shallow copy of `snapshot` with round text fields overlaid by the
 * hash-verified translations for `lang`. Non-text fields (year, latitude,
 * longitude, imageUrl, region, playerRoundResults, hint tier/type/metadata/
 * display_order) stay byte-identical. Rounds whose English text is empty
 * stay empty (reveal gating is preserved).
 */
export async function localizeSnapshot<T extends CompeteSessionSnapshot>(
  snapshot: T,
  lang: string | null
): Promise<T> {
  if (lang == null) return snapshot;
  if (!Array.isArray(snapshot.rounds)) return snapshot;

  const eventIds = [
    ...new Set(
      snapshot.rounds
        .map((round) => round.eventId)
        .filter(
          (id): id is string => typeof id === "string" && id.trim() !== ""
        )
    ),
  ];

  const overlay = await fetchContentTranslations(eventIds, lang).catch(
    () => null
  );
  if (overlay === null) return snapshot;

  const rounds = snapshot.rounds.map((round) => {
    const eventTr = overlay.events.get(round.eventId);
    const locationTr = overlay.locations.get(round.eventId);
    return {
      ...round,
      title:
        round.title.trim() === ""
          ? round.title
          : overlayText(round.title, eventTr?.title),
      description: overlayNullableText(
        round.description,
        eventTr?.description
      ),
      locationName: overlayNullableText(
        round.locationName,
        locationTr?.displayName
      ),
      hints: round.hints.map((hint) => ({
        ...hint,
        content: overlayText(hint.content, overlay.hints.get(hint.id)?.content),
      })),
    };
  });

  return { ...snapshot, rounds } as T;
}
