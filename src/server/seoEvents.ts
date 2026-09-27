import { dbPool } from "./db";
import type { Pool } from "pg";

type DbExecutor = Pick<Pool, "query">;

/**
 * SEO-BUILD-EVENTSPAGES-001
 *
 * Read-only queries backing the public, indexable /events and /events/:slug
 * editorial pages. These are intentionally separate from src/server/events.ts
 * (which powers live game sessions) so the SEO surface can evolve without
 * touching gameplay-critical queries.
 *
 * THE ONE INVARIANT: every function here reads directly from the `events`
 * table (+ its `locations`/`images` joins) at request time. There is no
 * second, hand-authored content source — a DB write to `events` is the only
 * thing required to create/update/remove a public event page.
 */

/**
 * Eligibility rule for a public SEO page (mirrors the game's eligibility
 * baseline in fetchEventsWithDetails, plus the fields an editorial page
 * cannot render without):
 *   - status = 'validated'            (existing publish gate)
 *   - description present & non-empty  (page body)
 *   - locations row with lat/long      (place name + structured data)
 *   - at least one image               (OG image / hero)
 */
const ELIGIBILITY_WHERE = `
  e.status = 'validated'
  AND e.description IS NOT NULL
  AND length(trim(e.description)) > 0
  AND l.latitude IS NOT NULL
  AND l.longitude IS NOT NULL
  AND EXISTS (SELECT 1 FROM images i WHERE i.event_id = e.id)
`;

export type SeoEventDetail = {
  id: string;
  slug: string;
  title: string;
  description: string;
  year: number;
  category: string | null;
  theme: string | null;
  location: {
    name: string | null;
    country: string | null;
    continent: string | null;
    lat: number;
    lng: number;
  };
  imageUrl: string | null;
};

export type SeoEventSummary = {
  slug: string;
  title: string;
  year: number;
  category: string | null;
  continent: string | null;
  imageUrl: string | null;
  lat: number;
  lng: number;
};

type EligibleRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  event_year: number;
  category: string | null;
  theme: string | null;
  display_name: string | null;
  country: string | null;
  continent: string | null;
  latitude: number;
  longitude: number;
  image_url: string | null;
};

const SELECT_EVENT_COLUMNS = `
  e.id,
  e.slug,
  e.title,
  e.description,
  e.event_year,
  e.category,
  e.theme,
  l.display_name,
  l.country,
  l.continent,
  l.latitude,
  l.longitude,
  (
    SELECT i.url FROM images i
    WHERE i.event_id = e.id
    ORDER BY i.display_order NULLS LAST, i.created_at
    LIMIT 1
  ) AS image_url
`;

function mapRow(row: EligibleRow): SeoEventDetail {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    year: row.event_year,
    category: row.category,
    theme: row.theme,
    location: {
      name: row.display_name,
      country: row.country,
      continent: row.continent,
      lat: row.latitude,
      lng: row.longitude,
    },
    imageUrl: row.image_url,
  };
}

/** Fetch a single eligible event by its public slug, or null if it doesn't exist / isn't eligible. */
export async function fetchSeoEventBySlug(
  slug: string,
  executor: DbExecutor = dbPool
): Promise<SeoEventDetail | null> {
  const result = await executor.query<EligibleRow>(
    `
      SELECT ${SELECT_EVENT_COLUMNS}
      FROM events e
      JOIN locations l ON l.event_id = e.id
      WHERE e.slug = $1
        AND ${ELIGIBILITY_WHERE}
      LIMIT 1
    `,
    [slug]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

/** Every currently-eligible slug, for static params / sitemap generation. */
export async function fetchAllEligibleSlugs(
  executor: DbExecutor = dbPool
): Promise<{ slug: string; updatedAt: string | null }[]> {
  const result = await executor.query<{ slug: string; updated_at: string | null }>(
    `
      SELECT e.slug, e.created_at::text AS updated_at
      FROM events e
      JOIN locations l ON l.event_id = e.id
      WHERE ${ELIGIBILITY_WHERE}
      ORDER BY e.slug
    `
  );
  return result.rows.map((r) => ({ slug: r.slug, updatedAt: r.updated_at }));
}

/** Count of currently-eligible events (used for a quick sitemap/eligibility sanity check). */
export async function countEligibleEvents(executor: DbExecutor = dbPool): Promise<number> {
  const result = await executor.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM events e
      JOIN locations l ON l.event_id = e.id
      WHERE ${ELIGIBILITY_WHERE}
    `
  );
  return Number(result.rows[0]?.count ?? 0);
}

export type SeoEventsQuery = {
  page?: number;
  pageSize?: number;
  /** Free-text match against title + description. */
  q?: string;
  /** Sort by event year; default "newest". */
  sort?: "newest" | "oldest";
  yearFrom?: number;
  yearTo?: number;
  continent?: string;
  theme?: string;
};

/** Distinct continents/themes + year bounds of eligible events, for the /events filter UI. */
export async function fetchSeoEventsFilterMeta(
  executor: DbExecutor = dbPool
): Promise<{ continents: string[]; themes: string[]; minYear: number | null; maxYear: number | null }> {
  const [continents, themes, bounds] = await Promise.all([
    executor.query<{ continent: string }>(
      `
        SELECT DISTINCT l.continent
        FROM events e
        JOIN locations l ON l.event_id = e.id
        WHERE ${ELIGIBILITY_WHERE}
          AND l.continent IS NOT NULL
          AND length(trim(l.continent)) > 0
        ORDER BY l.continent
      `
    ),
    executor.query<{ theme: string }>(
      `
        SELECT DISTINCT e.theme
        FROM events e
        JOIN locations l ON l.event_id = e.id
        WHERE ${ELIGIBILITY_WHERE}
          AND e.theme IS NOT NULL
          AND length(trim(e.theme)) > 0
        ORDER BY e.theme
      `
    ),
    executor.query<{ min_year: number | null; max_year: number | null }>(
      `
        SELECT MIN(e.event_year) AS min_year, MAX(e.event_year) AS max_year
        FROM events e
        JOIN locations l ON l.event_id = e.id
        WHERE ${ELIGIBILITY_WHERE}
      `
    ),
  ]);
  return {
    continents: continents.rows.map((r) => r.continent),
    themes: themes.rows.map((r) => r.theme),
    minYear: bounds.rows[0]?.min_year ?? null,
    maxYear: bounds.rows[0]?.max_year ?? null,
  };
}

/** Paginated, indexable listing for /events, with optional search/sort/filters. */
export async function fetchSeoEventsPage(
  options: SeoEventsQuery = {},
  executor: DbExecutor = dbPool
): Promise<{ events: SeoEventSummary[]; total: number; page: number; pageSize: number }> {
  const pageSize = Math.min(Math.max(options.pageSize ?? 24, 1), 2000);
  const page = Math.max(options.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [ELIGIBILITY_WHERE];
  const params: (string | number)[] = [];

  const q = options.q?.trim();
  if (q) {
    params.push(`%${q}%`);
    conditions.push(`(e.title ILIKE $${params.length} OR e.description ILIKE $${params.length})`);
  }
  if (typeof options.yearFrom === "number" && Number.isFinite(options.yearFrom)) {
    params.push(Math.trunc(options.yearFrom));
    conditions.push(`e.event_year >= $${params.length}`);
  }
  if (typeof options.yearTo === "number" && Number.isFinite(options.yearTo)) {
    params.push(Math.trunc(options.yearTo));
    conditions.push(`e.event_year <= $${params.length}`);
  }
  if (options.continent) {
    params.push(options.continent);
    conditions.push(`l.continent = $${params.length}`);
  }
  if (options.theme) {
    params.push(options.theme);
    conditions.push(`e.theme = $${params.length}`);
  }

  const where = conditions.join("\n        AND ");
  const orderBy =
    options.sort === "oldest"
      ? "e.event_year ASC, e.title ASC"
      : "e.event_year DESC, e.title ASC";

  const [rows, countResult] = await Promise.all([
    executor.query<EligibleRow>(
      `
        SELECT ${SELECT_EVENT_COLUMNS}
        FROM events e
        JOIN locations l ON l.event_id = e.id
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, pageSize, offset]
    ),
    executor.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM events e
        JOIN locations l ON l.event_id = e.id
        WHERE ${where}
      `,
      params
    ),
  ]);

  return {
    events: rows.rows.map(mapSummaryRow),
    total: Number(countResult.rows[0]?.count ?? 0),
    page,
    pageSize,
  };
}

function mapSummaryRow(row: EligibleRow): SeoEventSummary {
  return {
    slug: row.slug,
    title: row.title,
    year: row.event_year,
    category: row.category,
    continent: row.continent,
    imageUrl: row.image_url,
    lat: row.latitude,
    lng: row.longitude,
  };
}

/**
 * Related events for /events/:slug — same category, excluding the event
 * itself, closest in year first. Capped at `limit` (default 12, the page
 * renders them as a single horizontal sliding rail).
 */
export async function fetchRelatedSeoEvents(
  event: Pick<SeoEventDetail, "id" | "category" | "year">,
  limit = 12,
  executor: DbExecutor = dbPool
): Promise<SeoEventSummary[]> {
  if (!event.category) return [];
  const result = await executor.query<EligibleRow>(
    `
      SELECT ${SELECT_EVENT_COLUMNS}
      FROM events e
      JOIN locations l ON l.event_id = e.id
      WHERE ${ELIGIBILITY_WHERE}
        AND e.id != $1
        AND e.category = $2
      ORDER BY ABS(e.event_year - $3) ASC, e.title ASC
      LIMIT $4
    `,
    [event.id, event.category, event.year, limit]
  );
  return result.rows.map(mapSummaryRow);
}
