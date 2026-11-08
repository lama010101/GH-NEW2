# AI fleet diagnosis — AIP-BUILD-FLEETFINAL-1103-060

Read-only evidence gathered 2026-11-03 against PROD (gzvixlvkwjsrtmtybtkf) via SQL, the live OpenRouter `/api/v1/models` list and `GET /api/v1/key` (key never printed).

## 1A. Qwen3 VL 8B 429 root cause

Fact: the 429s are an UPSTREAM-PROVIDER throttle on a shared pool, not an OpenRouter account limit, and the fleet amplifies it with an immediate retry storm.

Evidence (ai_answer_bank_calls, model `qwen/qwen3-vl-8b-instruct`, last 14 days):

| UTC day | calls | 429 calls | bank rows | max turn | peak calls/min (Qwen) |
|---|---|---|---|---|---|
| 2026-10-21 | 16 | 2 | 5 | 3 | - |
| 2026-10-22..26 | 12-15/day | 0 | 4-5 | 3 | - |
| 2026-10-31 | 52 | 38 | 5 | 3 | 12 |
| 2026-11-01 | 30 | 30 | 5 | 1 (turn 1 only) | 15 |
| 2026-11-02 | 23 | 18 | 4 | 3 | 11 |

- Exact 429 payload (identical on every 429; 88 of 88 in 14 days): `error.code=429, message="Provider returned error", metadata.raw="qwen/qwen3-vl-8b-instruct is temporarily rate-limited upstream...", metadata.provider_name="Parasail", metadata.limit_source="upstream_provider_shared_pool", is_byok=false`. No Retry-After value is stored (worker keeps body only, not headers).
- 88/88 Qwen 429s carry `limit_source=upstream_provider_shared_pool` and `provider_name=Parasail`; 0 are OpenRouter platform limits. Gemini 2.5 Flash Lite also had 19 upstream-shared-pool 429s (3 on 2026-11-02).
- Account tier (GET /api/v1/key): `is_free_tier=false`, `free_model_daily_requests={used:0,limit:1000}`, key credit limit $10 with $9.84 remaining, `rate_limit` field deprecated. So the account is not throttled; Qwen is a PAID model (`qwen/qwen3-vl-8b-instruct`, prompt $0.00000025 / completion $0.00000075 per token), the free-model limits do not apply to it.
- Official limits (https://openrouter.ai/docs/api-reference/limits): free `:free` variants 20 requests/min; 1000 requests/day with >= $10 credits purchased (50/day below). 429 may come from OpenRouter (platform limits) or the upstream provider; honor `Retry-After`, use exponential backoff.
- Retry storm (hypotheses tested):
  - Multi-turn fan-out: REJECTED as cause. 429s occur on turn 1 (the first request of an event); a successful play makes 3 calls (guess, hint turn optional, critique) = 13-16 calls over several events on good days.
  - Retry amplification: CONFIRMED. On 2026-11-01 each of 5 events produced exactly 6 turn-1 calls (30 calls / 5 events): initial + 2 immediate retries (RETRY_DELAYS_MS=[1000,4000]) per pass, times 2 passes (main pass + 120 s sweep). The 1s/4s retries land inside the same throttle window.
  - No Retry-After honoring: CONFIRMED (headers are never read by `callOpenRouter` in generate-answers-v3.ts; delays are hard-coded in daily-autoplay.ts:23).
  - No per-model pacing: CONFIRMED (PLAYER_CONCURRENCY=3 players in parallel, no per-model limiter; peak fleet calls/min: 38 on 2026-11-02, 45 on 2026-10-25).
  - Single upstream provider: CONFIRMED for Qwen (all 88 on Parasail). Provider pinning is not applied: OpenRouter fallback routing already tries other providers, and the error reaches us only after the pool is exhausted.
- Daily play shape: Daily has 5 events/day; Qwen peak 11-15 calls/min against a shared upstream pool.

## 1B. Idle-roster diagnosis (13 players with is_active_daily=true)

Cause (code evidence): scripts/ai-players/daily-autoplay.ts:430 selects `WHERE is_active_daily = true AND is_active = true AND deleted_at IS NULL`. Ten of the thirteen have `is_active=false` (admin Deactivate action, src/app/admin/dashboard/models/actions.ts:48) so they are never selected; preflight/budget/halt are not involved.

| Player | model_id | is_active | last_row_at | last ok | Reason |
|---|---|---|---|---|---|
| Gemini 2.5 Flash Lite | google/gemini-2.5-flash-lite | true | 2026-11-02 | 2026-11-02 | plays (paid vision) |
| Ministral 3 3B | mistralai/ministral-3b-2512 | true | 2026-11-02 | 2026-11-02 | plays (paid vision) |
| Qwen3 VL 8B Instruct | qwen/qwen3-vl-8b-instruct | true | 2026-11-02 | 2026-11-02 | plays; 429 storm (1A) |
| Gemma 3 4B | google/gemma-3-4b-it | false | 2026-08-19 | 2026-08-17 | admin-deactivated; alive, paid vision |
| Gemma 4 26B A4B | google/gemma-4-26b-a4b-it:free | false | 2026-08-19 | 2026-08-19 | admin-deactivated; alive, FREE vision |
| Gemma 4 31B | google/gemma-4-31b-it:free | false | 2026-08-19 | 2026-08-13 | admin-deactivated; alive, FREE vision |
| Laguna XS 2.1 | poolside/laguna-xs-2.1:free | false | 2026-08-11 | never | deactivated; DEAD slug (not in catalog) |
| Ling 3.0 Tiny | inclusionai/ling-3.0-tiny:free | false | 2026-10-21 | never | deactivated; DEAD slug |
| Nemotron 3 Ultra | nvidia/nemotron-3-ultra-550b-a55b:free | false | 2026-08-11 | never | deactivated; alive but TEXT-ONLY (preflight "no image input") |
| Nemotron Nano 9B V2 | nvidia/nemotron-nano-9b-v2:free | false | 2026-08-11 | never | deactivated; DEAD slug |
| Nex-N2-Mini | nex-agi/nex-n2-mini | false | 2026-08-19 | never | deactivated; DEAD slug |
| Qwen3.7 Flash | qwen/qwen3.7-flash | false | 2026-10-21 | 2026-10-21 | deactivated; alive paid vision; has is_active_practice=true but no code path in the repo plays Practice |

Also: the repo has NO Practice bank-fill path (grep "practice" in scripts/ai-players returns only the unused `kind` literal and the ensureAiPlayer INSERT). The CTO fact "Qwen3.7 Flash plays practice" is not supported by code or data (is_active=false, last row 2026-10-21).

## 1C. Catalog truth (live /api/v1/models, 451 models; 17 free)

| model_id | free | vision | alive | ctx | max out |
|---|---|---|---|---|---|
| google/gemini-2.5-flash-lite | paid | vision | yes | 1048576 | 65535 |
| google/gemma-3-4b-it | paid | vision | yes | 131072 | 16384 |
| google/gemma-4-26b-a4b-it:free | FREE | vision | yes | 262144 | 32768 |
| google/gemma-4-31b-it:free | FREE | vision | yes | 262144 | 32768 |
| nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free | FREE | vision | yes | 256000 | 65536 |
| mistralai/ministral-3b-2512 | paid | vision | yes | 131072 | 104857 |
| qwen/qwen3-vl-8b-instruct | paid | vision | yes | 262144 | 235929 |
| qwen/qwen3.7-flash | paid | vision | yes | 1000000 | 65536 |
| anthropic/claude-sonnet-4.6 | paid | vision | yes | 1000000 | 128000 |
| nvidia/nemotron-3-ultra-550b-a55b:free | FREE | text | yes | 1000000 | 65536 |
| cohere/north-mini-code:free | FREE | text | yes | 256000 | 64000 |
| tencent/hy-mt2-30b-a3b | paid | text | yes | 8192 | 4096 |
| poolside/laguna-xs-2.1:free, poolside/laguna-s-2.1:free, inclusionai/ling-3.0-tiny:free, nvidia/nemotron-nano-9b-v2:free, nex-agi/nex-n2-mini, nvidia/nemotron-3-nano-30b-a3b:free, nvidia/nemotron-3-super-120b-a12b:free, nvidia/nemotron-nano-12b-v2-vl:free | - | - | DEAD | - | - |

FREE+VISION+ALIVE on the roster: gemma-4-26b-a4b-it:free, gemma-4-31b-it:free, nemotron-3-nano-omni-30b-a3b-reasoning:free. Catalog free+vision slugs NOT on the roster: nvidia/nemotron-3.5-super-vl:free, dots-studio/dots-3-note-preview:free, thinkingmachines/inkling-small:free, thinkingmachines/inkling:free (plus non-text-output entries: nvidia/nemotron-3.5-content-safety:free, google/lyria-3-*, openrouter/free router, which are not players).
TEXT-ONLY+ALIVE: nvidia/nemotron-3-ultra-550b-a55b:free, cohere/north-mini-code:free, tencent/hy-mt2-30b-a3b (paid, ctx 8192).
qwen/qwen3-vl-8b-instruct is correctly PAID (prompt/completion both > 0).

## 1D. Coverage baseline

- events total 2183; status='validated' with image + coordinates (playable by generate-answers-v3, which requires `status='validated'`) = 1233.
- Events with any ai_answer_bank row: 282 (of 2183); with >=1 successful (error IS NULL) row: 145.
- Successful events per player (daily-challenge events / non-daily events): Gemini 2.5 Flash Lite 91/21, Ministral 3B 81/2, Qwen3 VL 8B 79/1, Claude Sonnet 4.6 55/23, Gemma 4 26B 30/1, Nemotron Nano Omni 30/2, Qwen3.7 Flash 26/12, Gemma 3 4B 20/2, Nemotron Nano 12B VL 15/1, Gemma 4 31B 1/0; all other rows are error-only.
- ai_answer_bank has UNIQUE (event_id, ai_player_id): one play per player per event, so Daily-then-Practice means Practice only fills events a player has no successful row for.
- Fleet runs: last ai_fleet_runs row 2026-11-02 daily, attempted 12, ok 10, failed_rate_limit 2. ai_fleet_settings holds only `fleet_daily_cap_usd = 2`.
