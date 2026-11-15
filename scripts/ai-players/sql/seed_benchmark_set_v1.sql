-- AIP-BUILD-BENCHMARKSCHEMA-1114-305 — bench-v1 draft seed (NOT a migration).
-- Guarded and re-runnable; NEVER freezes the set (no UPDATE of status).
--
-- Pool: the same "eligible event" definition used by ai_model_reliability
--   (events.status='validated', retired_at IS NULL, has an images row, has a
--   locations row with non-null latitude/longitude) MINUS events listed in
--   ai_events_needing_review, restricted to event_year IS NOT NULL (the era
--   bucket requires a year).
-- Strata: era bucket (<1500 / 1500-1799 / 1800-1899 / 1900-1949 /
--   1950-1989 / 1990+) x coarse region. The events table has no
--   country/continent column, so region uses coarse lat/lng buckets on the
--   event's location coordinates (AVG over its non-null location rows):
--   latitude sign N/S x longitude bands [180W_60W | 60W_60E | 60E_180E].
-- Allocation: floor of 3 per non-empty stratum (capped at stratum size for
--   strata with <3 events); the remaining slots are distributed
--   proportionally to stratum size by largest remainder. Deterministic
--   everywhere via md5(event_id::text || 'bench-v1').

DO $seed$
DECLARE
  v_set_id uuid;
  v_status text;
  v_inserted int;
BEGIN
  SELECT id, status INTO v_set_id, v_status
  FROM public.ai_benchmark_sets
  WHERE version = 1;

  IF v_set_id IS NULL THEN
    INSERT INTO public.ai_benchmark_sets (version, name, status, prompt_version)
    VALUES (1, 'bench-v1', 'draft', 'bench-v1')
    RETURNING id INTO v_set_id;
  ELSIF v_status <> 'draft' THEN
    RAISE EXCEPTION 'ai_benchmark_sets version=1 is %; refusing to reseed', v_status;
  END IF;

  -- Draft sets are mutable: rebuild the item list deterministically.
  DELETE FROM public.ai_benchmark_set_items WHERE set_id = v_set_id;

  INSERT INTO public.ai_benchmark_set_items
    (set_id, event_id, stratum, era, region, difficulty, seq)
  WITH eligible AS (
    SELECT e.id, e.event_year
    FROM public.events e
    WHERE e.status = 'validated'
      AND e.retired_at IS NULL
      AND EXISTS (SELECT 1 FROM public.images i WHERE i.event_id = e.id)
      AND EXISTS (
        SELECT 1 FROM public.locations l
        WHERE l.event_id = e.id AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL
      )
  ),
  pool AS (
    SELECT e.id AS event_id, e.event_year
    FROM eligible e
    WHERE e.event_year IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.ai_events_needing_review r
        WHERE r.event_id = e.id
      )
  ),
  loc AS (
    SELECT l.event_id, AVG(l.latitude) AS lat, AVG(l.longitude) AS lng
    FROM public.locations l
    JOIN pool p ON p.event_id = l.event_id
    WHERE l.latitude IS NOT NULL AND l.longitude IS NOT NULL
    GROUP BY l.event_id
  ),
  scored AS (
    SELECT
      p.event_id,
      p.event_year,
      CASE
        WHEN p.event_year < 1500 THEN 'pre_1500'
        WHEN p.event_year < 1800 THEN '1500_1799'
        WHEN p.event_year < 1900 THEN '1800_1899'
        WHEN p.event_year < 1950 THEN '1900_1949'
        WHEN p.event_year < 1990 THEN '1950_1989'
        ELSE '1990_plus'
      END AS era,
      (CASE WHEN l.lat >= 0 THEN 'N' ELSE 'S' END) || '_' ||
      (CASE
        WHEN l.lng < -60 THEN '180W_60W'
        WHEN l.lng < 60 THEN '60W_60E'
        ELSE '60E_180E'
      END) AS region,
      md5(p.event_id::text || 'bench-v1') AS h
    FROM pool p
    JOIN loc l ON l.event_id = p.event_id
  ),
  strata AS (
    SELECT era, region, count(*) AS n
    FROM scored
    GROUP BY era, region
  ),
  tiny AS (
    SELECT era, region, n FROM strata WHERE n <= 3
  ),
  flex AS (
    SELECT era, region, n FROM strata WHERE n > 3
  ),
  extra_pool AS (
    SELECT 120
      - COALESCE((SELECT sum(n) FROM tiny), 0)
      - 3 * (SELECT count(*) FROM flex) AS r
  ),
  quota AS (
    SELECT
      f.era,
      f.region,
      f.n,
      FLOOR(ep.r::numeric * f.n / (SELECT sum(n) FROM flex))::int AS qf,
      (ep.r::numeric * f.n / (SELECT sum(n) FROM flex))
        - FLOOR(ep.r::numeric * f.n / (SELECT sum(n) FROM flex)) AS qrem,
      md5(f.era || '|' || f.region || '|bench-v1') AS h
    FROM flex f
    CROSS JOIN extra_pool ep
  ),
  leftover AS (
    SELECT COALESCE((SELECT r FROM extra_pool), 0)
      - COALESCE((SELECT sum(qf) FROM quota), 0) AS n
  ),
  ranked AS (
    SELECT *,
           row_number() OVER (ORDER BY qrem DESC, h, era, region) AS rn
    FROM quota
  ),
  alloc AS (
    SELECT era, region, n AS alloc FROM tiny
    UNION ALL
    SELECT q.era, q.region,
           3 + q.qf + CASE WHEN q.rn <= (SELECT n FROM leftover) THEN 1 ELSE 0 END
    FROM ranked q
  ),
  picked AS (
    SELECT s.*, a.alloc,
           row_number() OVER (
             PARTITION BY s.era, s.region ORDER BY s.h, s.event_id
           ) AS rn_in_stratum
    FROM scored s
    JOIN alloc a ON a.era = s.era AND a.region = s.region
  ),
  selected AS (
    SELECT * FROM picked WHERE rn_in_stratum <= alloc
  ),
  final AS (
    SELECT *,
           row_number() OVER (ORDER BY h, event_id) AS seq
    FROM selected
  )
  SELECT
    v_set_id,
    f.event_id,
    f.era || '|' || f.region AS stratum,
    f.era,
    f.region,
    d.avg_difficulty_score AS difficulty,
    f.seq
  FROM final f
  LEFT JOIN public.ai_event_ai_difficulty d ON d.event_id = f.event_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> 120 THEN
    RAISE EXCEPTION 'bench-v1 seed produced % items, expected 120', v_inserted;
  END IF;
END
$seed$;
