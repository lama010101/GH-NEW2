---
name: testing-ai-players
description: How to validate the AI-players batch pipeline in GH-NEW2.
---

## When to use

Run this skill when testing changes to `scripts/ai-players/generate-answers.ts`, `scripts/ai-players/run-batch.ts`, or the `ai_players` / `ai_answer_bank` schema.

## Environment

The repo uses `tsx` to run standalone TypeScript scripts. Required env vars are in `.env.local` or repo secrets:

- `OPENROUTER_API_KEY`
- `SUPABASE_DB_CONNECTION`

Source the secrets file before running:

```bash
source /run/repo_secrets/lama010101/GH-NEW2/.env.secrets
```

## Commands

Single-event PoC:

```bash
npx tsx scripts/ai-players/generate-answers.ts <event-id>
```

Batch dry-run (3 events):

```bash
npx tsx scripts/ai-players/run-batch.ts --limit=3
```

Full batch:

```bash
npx tsx scripts/ai-players/run-batch.ts
```

## Verification queries

Check the most recent rows:

```sql
SELECT event_id, guess_lat, guess_lng, guess_year, distance_km, year_diff,
       location_accuracy, year_accuracy, round_accuracy, round_xp,
       error IS NULL AS ok
FROM ai_answer_bank
ORDER BY created_at DESC
LIMIT 10;
```

Count processed:

```sql
SELECT COUNT(*) FROM ai_answer_bank WHERE ai_player_id = '<id>' AND error IS NULL;
```

## Notes

- `tsconfig.json` excludes `scripts/`, so `npx tsc --noEmit` does not type-check these files. Runtime validation via `tsx` is the primary check.
- `npx next lint` does not lint `scripts/`.
- The batch runner skips events already successfully scored (`error IS NULL`) for the same `ai_player_id`.
