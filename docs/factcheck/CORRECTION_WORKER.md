# Correction worker protocol corr-v1

EDQ-BUILD-CORRECTIONLOOP-1126-898

A correction is a claim, not a fact. The first checker is never trusted as proof. A second, independent worker must verify the corrected claim blindly.

## Claim work

Run:

```bash
npx tsx scripts/factcheck/corrections-cli.ts claim --worker <WORKER_ID> --n 8 --lease-min 30
```

The output is JSON only. For each `event_id` it contains:

- `stored`: the current event title, description, year, and stored location display/country.
- `proposed`: only the proposed `title?`, `year?`, and/or `description?`.

It intentionally does **not** contain the original checker, original sources, verdict notes, or any explanation. Do not try to recover them. Verify the proposed corrected claim independently.

## Verify

For each claimed event:

1. Treat `proposed` as the claim under test.
2. Find independent reliable sources. Do not use the event itself, game data, or the original checker output as evidence.
3. Verify title/year/place as a whole. Place verification is against the stored place; the correction protocol does not authorize place changes.
4. Every source object must include:
   - `url` — http(s) URL;
   - `domain` — lowercase source domain;
   - `quote` — verbatim supporting quote, maximum 25 words.
5. Use at least two sources and at least two independent domains for a TRUE verification. `wikipedia.org`, `wikidata.org`, `dbpedia.org`, and `wikimedia.org` (including subdomains) are one family, so combinations inside that family count as only one independent domain.

## Record

Write a JSON array to a result file, then run:

```bash
npx tsx scripts/factcheck/corrections-cli.ts record --worker <WORKER_ID> --file <result.json>
```

Record shape:

```json
[
  {
    "event_id": "uuid",
    "verdict": "TRUE",
    "title_ok": true,
    "year_ok": true,
    "place_ok": true,
    "sources": [
      { "url": "https://example.com/source", "domain": "example.com", "quote": "short verbatim quote" }
    ],
    "corrected": { "title": "exact proposed title", "year": 1804, "description": "exact proposed description" },
    "notes": "optional short note"
  }
]
```

Rules:

- Include in `corrected` the same `title`/`year`/`description` values present in `proposed` for that event. Do not add a title or year that was not proposed.
- You may add `corrected.description` when the proposal did not contain one only to remove stale references to the old year/title from the narrative; that verified description is the one applied.
- Title comparison is normalized (trim, collapsed whitespace, case-insensitive); year comparison is numeric; a proposed description must match after whitespace normalization.
- If you cannot verify the proposed correction exactly, return the appropriate non-TRUE verdict or omit `corrected`; the candidate becomes `disputed` and the event stays quarantined.
- Reliability input is ignored if present. Reliability is always computed server-side by `computeReliability`.
- Verdict `TRUE` requires `title_ok`, `year_ok`, and `place_ok` all explicitly true; otherwise the deterministic reliability rule downgrades the verdict.

## Never do

- Never mark TRUE from one source or from sources inside only one domain family.
- Never use or quote the original wrong-row notes/sources; verification is blind.
- Never propose or apply a place change.
- Never treat a year shift greater than 10 years as auto-applicable; the apply command marks it `year_shift_needs_image_review` and leaves the event quarantined for image/manual review.
- Never revive a `NOT_REAL` event. `NOT_REAL` events stay quarantined forever.
- Never edit events directly. Only the apply command can apply a verified correction, and it re-checks the database state before writing.
