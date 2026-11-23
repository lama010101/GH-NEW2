// I18N-BUILD-OVERLAYCORE-1123-852
//
// Hash-checked translation overlay for DB-backed English content.
//
// Source of truth: the *_translations tables (event_translations,
// hint_translations, location_translations) hold per-language rows tied to
// the English source row they were generated from. Each row carries
// source_hash = sha256 hex of the UTF-8 English source fields joined by
// U+241F (NULL treated as ''). The hash comparison runs IN SQL: a
// translation row is returned only when its source_hash still matches the
// live English row, so a stale or unverifiable row silently falls back to
// English for that whole entity (never field-by-field).
//
// Per-field English fallback is applied by overlayText /
// overlayNullableText: a null or blank translated field serves the English
// value. overlayNullableText additionally never ADDS content that English
// did not expose (English may be empty for reveal-gating reasons).
//
// No caching, no module-level state: every call reads the DB.

import type { Pool } from "pg";
import { dbPool } from "./db";
import { locales, type Locale } from "@/i18n/config";

type DbExecutor = Pick<Pool, "query">;

export type EventTranslation = {
  title: string | null;
  description: string | null;
  category: string | null;
  theme: string | null;
};

export type HintTranslation = {
  content: string | null;
};

export type LocationTranslation = {
  displayName: string | null;
  country: string | null;
};

export type ContentTranslations = {
  events: Map<string, EventTranslation>;
  hints: Map<string, HintTranslation>;
  locations: Map<string, LocationTranslation>;
};

const MAX_EVENT_IDS = 2000;

/**
 * Raw locale value (cookie etc.) -> overlay locale. English is the content
 * source language and needs no overlay; empty or unknown values resolve to
 * null (English fallback).
 */
export function resolveOverlayLocale(
  raw: string | null | undefined
): Locale | null {
  if (raw == null || raw.trim() === "") return null;
  if (raw === "en") return null;
  return (locales as readonly string[]).includes(raw) ? (raw as Locale) : null;
}

type EventTranslationRow = {
  event_id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  theme: string | null;
};

type HintTranslationRow = {
  hint_id: string;
  content: string | null;
};

type LocationTranslationRow = {
  event_id: string;
  display_name: string | null;
  country: string | null;
};

function emptyTranslations(): ContentTranslations {
  return { events: new Map(), hints: new Map(), locations: new Map() };
}

/**
 * Fetch hash-verified translations for the given event ids in `lang`.
 * Returns empty maps (English fallback) when `lang` resolves to null, when
 * no ids remain after dedupe/cap, or on any DB error — never throws.
 */
export async function fetchContentTranslations(
  eventIds: string[],
  lang: string | null,
  executor: DbExecutor = dbPool
): Promise<ContentTranslations> {
  const locale = resolveOverlayLocale(lang);
  if (!locale) return emptyTranslations();

  const ids = [...new Set(eventIds)].slice(0, MAX_EVENT_IDS);
  if (ids.length === 0) return emptyTranslations();

  try {
    const [eventResult, hintResult, locationResult] = await Promise.all([
      executor.query<EventTranslationRow>(
        `SELECT e.id AS event_id, et.title, et.description, et.category, et.theme
         FROM event_translations et
         JOIN events e ON e.id = et.event_id
         WHERE e.id = ANY($1::uuid[])
           AND et.language_code = $2
           AND et.source_hash = encode(sha256(convert_to(concat_ws(chr(9247), coalesce(e.title,''), coalesce(e.description,''), coalesce(e.category,''), coalesce(e.theme,'')),'UTF8')),'hex')`,
        [ids, locale]
      ),
      executor.query<HintTranslationRow>(
        `SELECT h.id AS hint_id, ht.content
         FROM hint_translations ht
         JOIN hints h ON h.id = ht.hint_id
         WHERE h.event_id = ANY($1::uuid[])
           AND ht.language_code = $2
           AND ht.source_hash = encode(sha256(convert_to(coalesce(h.content,''),'UTF8')),'hex')`,
        [ids, locale]
      ),
      executor.query<LocationTranslationRow>(
        `SELECT l.event_id, lt.display_name, lt.country
         FROM location_translations lt
         JOIN locations l ON l.id = lt.location_id
         WHERE l.event_id = ANY($1::uuid[])
           AND lt.language_code = $2
           AND lt.source_hash = encode(sha256(convert_to(concat_ws(chr(9247), coalesce(l.display_name,''), coalesce(l.country,'')),'UTF8')),'hex')`,
        [ids, locale]
      ),
    ]);

    const events = new Map<string, EventTranslation>();
    for (const row of eventResult.rows) {
      events.set(row.event_id, {
        title: row.title,
        description: row.description,
        category: row.category,
        theme: row.theme,
      });
    }
    const hints = new Map<string, HintTranslation>();
    for (const row of hintResult.rows) {
      hints.set(row.hint_id, { content: row.content });
    }
    const locations = new Map<string, LocationTranslation>();
    for (const row of locationResult.rows) {
      locations.set(row.event_id, {
        displayName: row.display_name,
        country: row.country,
      });
    }

    console.log(
      `[i18n-overlay] lang=${locale} requested=${ids.length} events=${events.size} hints=${hints.size} locations=${locations.size}`
    );
    return { events, hints, locations };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[i18n-overlay] fetch failed lang=${locale} requested=${ids.length} events=0 hints=0 locations=0 err=${message.slice(0, 160)}`
    );
    return emptyTranslations();
  }
}

/** Non-empty translated text wins; otherwise the English source is kept. */
export function overlayText(en: string, tr?: string | null): string {
  return tr != null && tr.trim() !== "" ? tr : en;
}

/**
 * Same rule as overlayText for nullable English fields, except a null or
 * empty English value is returned UNCHANGED — the overlay never adds
 * content that English did not expose.
 */
export function overlayNullableText(
  en: string | null,
  tr?: string | null
): string | null {
  if (en == null || en.trim() === "") return en;
  return overlayText(en, tr);
}
