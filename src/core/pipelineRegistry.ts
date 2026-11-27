// OPS-BUILD-PIPELINEPAGE-1126-915 — single typed registry for the metadata,
// fact-check, image, and publishing pipeline.
//
// STANDING RULE: "Every pipeline task must update the rows it touches in this file (status, ownerTask, lastUpdated, note) in its own PR. A pipeline PR that changes behaviour without a registry edit is rejected by the CTO (ruling R8)."
//
// Pure data module: no I/O, no env access, no clock. Admin pages render these
// declarations; live measurements come only from pipelineQueries.ts.

export const PIPELINE_STATUSES = [
  "planned",
  "in_progress",
  "built_dark",
  "live",
  "blocked",
  "superseded",
] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const STATUS_LABELS: Record<PipelineStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  built_dark: "Built dark",
  live: "Live",
  blocked: "Blocked",
  superseded: "Superseded",
};

export const STATUS_ORDER: readonly PipelineStatus[] = [
  "live",
  "in_progress",
  "built_dark",
  "planned",
  "blocked",
  "superseded",
];

export const STATUS_DEFINITIONS: Record<PipelineStatus, string> = {
  planned: "Not started.",
  in_progress: "A task is building it.",
  built_dark: "Merged but switched off or write-gated.",
  live: "Runs in prod and its gate passed.",
  blocked: "Cannot proceed; the reason is in the note.",
  superseded: "Replaced; the note says by what.",
};

export type Automation =
  | "cron"
  | "on_demand_script"
  | "manual_devin"
  | "manual_owner"
  | "in_app_runtime";

export const AUTOMATION_LABELS: Record<Automation, string> = {
  cron: "Automated cron",
  on_demand_script: "On-demand script",
  manual_devin: "Manual Devin worker",
  manual_owner: "Manual owner action",
  in_app_runtime: "In-app runtime",
};

export type PipelineStep = {
  id: string;
  stage: "collect" | "verify" | "images" | "publish";
  track: "legacy" | "generation" | "shared";
  title: string;
  summary: string;
  how: string[];
  deterministicVsLlm: "deterministic" | "llm" | "mixed";
  models: string[];
  inputs: string[];
  outputs: string[];
  automation: Automation;
  safeguards: string[];
  kpis: string[];
  status: PipelineStatus;
  ownerTask: string | null;
  lastUpdated: string;
  note: string;
  doneWhen: string;
  codePaths: string[];
};

export type Kpi = {
  id: string;
  label: string;
  definition: string;
  formula: string;
  denominator: string;
  unit: "count" | "percent" | "usd" | "ratio";
  target: string;
  source: string;
  liveKey: string;
};

export type Safeguard = {
  id: string;
  title: string;
  protects: string;
  mechanism: string;
  enforcedBy: "code" | "db" | "ci" | "process";
  status: PipelineStatus;
  ownerTask: string | null;
  lastUpdated: string;
  note: string;
};

const D = "2026-11-26";
const NOT_SET = "not set";

export const PIPELINE_STEPS: readonly PipelineStep[] = [
  {
    id: "legacy-events-pool",
    stage: "collect",
    track: "legacy",
    title: "Legacy events pool",
    summary:
      "The existing catalog is the legacy track: AI-written event narratives with deterministic hint rows and generated images. Facts are unverified by default until a fact-check row exists. At the 2026-11-26 measurement, 2,108 of 2,183 events remain in play because retired_at is null.",
    how: [
      "Events, locations, hints, and images already exist in the production content tables.",
      "New draws exclude rows whose events.retired_at tombstone is non-null.",
      "Verification and correction happen after collection instead of before publication.",
    ],
    deterministicVsLlm: "mixed",
    models: [],
    inputs: ["legacy AI-written catalog", "events", "locations", "hints", "images"],
    outputs: ["events in play", "events retired from play"],
    automation: "in_app_runtime",
    safeguards: ["quarantine-retired-at", "ai-honesty-copy"],
    kpis: ["events_in_play", "hints_complete", "images_total", "translation_coverage"],
    status: "live",
    ownerTask: null,
    lastUpdated: D,
    note: "This is inherited inventory, not a claim that every legacy fact is correct.",
    doneWhen: "The catalog remains readable in prod and new draws exclude every row with retired_at set.",
    codePaths: ["scripts/factcheck/review-cli.ts", "supabase/migrations/20261102120000_events_retired_at.sql"],
  },
  {
    id: "wikidata-harvest",
    stage: "collect",
    track: "generation",
    title: "Wikidata harvest",
    summary:
      "The generation track starts from Wikidata, not from an LLM. scripts/generation/harvest-wikidata.ts applies the pure fact-lock gates G1-G5 in src/core/factLock.ts before a candidate can be staged. Passing rows enter generation_candidates as new; failed or surplus rows can be retained as rejected audit rows.",
    how: [
      "SPARQL selects candidate Wikidata items by era and class.",
      "G1 checks event class, fictional-class exclusion, sitelinks, and English sitelink presence.",
      "G2 requires one usable date claim with sufficient precision and bounded span.",
      "G3 requires the year string in the English Wikipedia lead and in enough supporting language leads.",
      "G4 takes coordinates only from P625 or one P276 hop; G5 independently reverse-geocodes those coordinates and compares country ISO codes.",
      "Writes are dry-run gated and insert only into generation_candidates when --write is explicit.",
    ],
    deterministicVsLlm: "deterministic",
    models: [],
    inputs: ["Wikidata SPARQL", "Wikidata Action API", "Wikipedia lead extracts", "Nominatim reverse geocode"],
    outputs: ["generation_candidates rows", "locked title/year/coordinates/country metadata", "gate diagnostics"],
    automation: "on_demand_script",
    safeguards: ["fact-lock-gates", "signed-years"],
    kpis: ["candidates_by_status", "candidates_by_continent_and_era"],
    status: "in_progress",
    ownerTask: null,
    lastUpdated: D,
    note: "CTO-assigned owner task EDQ-FIX-HARVESTER-OPS-1126-904 covers pool resilience and the country-based continent fix; that exact string does not match the registry ownerTask pattern, so it is carried here instead of inventing a different task id.",
    doneWhen: "",
    codePaths: ["scripts/generation/harvest-wikidata.ts", "src/core/factLock.ts", "src/core/wikidataMatch.ts"],
  },
  {
    id: "narration-and-hints",
    stage: "collect",
    track: "generation",
    title: "Narration and hints",
    summary:
      "After fact lock, the generation-track narrator may use an LLM only for prose and prompt text: description, tier-5 clues, image prompt, negative prompt, theme, and category. The LLM receives Wikipedia extracts and is not allowed to invent the locked year or place. Hint tiers 1-4 are deterministic from Wikidata metadata, and every playable event needs exactly 10 hint rows: when tiers 1-5 and where tiers 1-5.",
    how: [
      "Supply Wikipedia extracts and locked facts as bounded inputs.",
      "Generate narrative and image-prompt fields without letting the model alter locked facts.",
      "Derive deterministic low-tier hints mechanically from the locked metadata.",
      "Run a mechanical grounding check against the supplied extracts before accepting narration.",
    ],
    deterministicVsLlm: "mixed",
    models: [],
    inputs: ["generation_candidates rows", "locked Wikidata facts", "Wikipedia extracts"],
    outputs: ["candidate title/description", "10 hint rows per publishable event", "image prompt and negative prompt", "theme/category"],
    automation: "on_demand_script",
    safeguards: ["fact-lock-gates", "signed-years"],
    kpis: ["candidates_by_status", "hints_complete"],
    status: "in_progress",
    ownerTask: "EDQ-BUILD-NARRATION-1126-905",
    lastUpdated: D,
    note: "The narration task is active in parallel; scripts/generation currently contains only harvest-wikidata.ts on main.",
    doneWhen: "",
    codePaths: ["scripts/generation/harvest-wikidata.ts", "src/core/factLock.ts"],
  },
  {
    id: "worker-fact-checks",
    stage: "verify",
    track: "legacy",
    title: "Worker fact-checks",
    summary:
      "Legacy events are checked by Devin workers with web access. Workers record verdicts and quoted sources into event_fact_checks through scripts/factcheck/review-cli.ts. At the 2026-11-26 measurement there were 343 ledger rows over 288 distinct events; the process is manual and slow but it is the currently live verification path.",
    how: [
      "A worker claims open event_review_queue rows with a lease.",
      "The worker inspects web sources and records title/year/place booleans, verdict, and source quotes.",
      "The CLI computes reliability with computeReliability; worker-supplied reliability is ignored.",
      "A wrong verdict with at least two sources and two independent domains retires a validated event through retired_at.",
    ],
    deterministicVsLlm: "mixed",
    models: [],
    inputs: ["event_review_queue", "event metadata", "web sources"],
    outputs: ["event_fact_checks rows", "event_reliability latest verdicts", "retired_at quarantines"],
    automation: "manual_devin",
    safeguards: ["quarantine-retired-at", "reliability-rule"],
    kpis: ["events_checked", "verdict_mix", "needs_recheck", "review_queue_state"],
    status: "live",
    ownerTask: null,
    lastUpdated: D,
    note: "Expected to be superseded in volume by the automated verify engine after gate G2 passes; it remains the live ledger path today.",
    doneWhen: "Workers can claim queue rows and write service-role fact-check rows whose latest verdict appears in event_reliability.",
    codePaths: ["scripts/factcheck/review-cli.ts", "src/core/eventReliability.ts", "supabase/migrations/20261124120000_event_review_queue.sql"],
  },
  {
    id: "reliability-score",
    stage: "verify",
    track: "shared",
    title: "Reliability score",
    summary:
      "computeReliability in src/core/eventReliability.ts is the single deterministic scoring rule for fact-check verdicts. Wrong verdicts score 0-20, soft verdicts score 50, and TRUE scores 70, 95, or 100 depending on source count and independent-domain count. The database view event_reliability uses the latest ledger row per event, and RELIABILITY_PLAY_MIN is 95.",
    how: [
      "Downgrade TRUE to the matching wrong verdict when title_ok, year_ok, or place_ok is not true.",
      "Score wrong verdicts at 0 with two or more sources, otherwise 20 plus needs_recheck.",
      "Score GENERIC, UNVERIFIABLE, and AMBIGUOUS at 50.",
      "Score TRUE at 70 below two sources/domains, 100 with three sources and three independent domains, otherwise 95.",
    ],
    deterministicVsLlm: "deterministic",
    models: [],
    inputs: ["verdict", "title/year/place booleans", "source count", "independent-domain count"],
    outputs: ["reliability 0-100", "needs_recheck", "event_reliability latest verdict"],
    automation: "on_demand_script",
    safeguards: ["reliability-rule"],
    kpis: ["verdict_mix", "pool_95", "needs_recheck"],
    status: "live",
    ownerTask: null,
    lastUpdated: D,
    note: "The scoring rule is deterministic; it is not an LLM confidence score.",
    doneWhen: "Latest verdicts are visible through event_reliability and the play threshold constant is RELIABILITY_PLAY_MIN = 95.",
    codePaths: ["src/core/eventReliability.ts", "scripts/factcheck/review-cli.ts"],
  },
  {
    id: "verify-engine",
    stage: "verify",
    track: "shared",
    title: "Automated verify engine",
    summary:
      "The automated engine is designed as a three-model-family consensus: a web-enabled investigator, a no-tool judge, and a tie-break when needed. A TRUE verdict requires mechanical quote proof: the URL is re-fetched, the quote is present, and the evidence contains year and place support. Source-family independence prevents Wikipedia, Wikidata, Wikimedia, and DBpedia from counting as separate families, while own domains, social sites, and Q&A sites never count; NOT_REAL requires positive evidence.",
    how: [
      "Investigator gathers quotable web evidence.",
      "Independent judge evaluates without web tools.",
      "Tie-break resolves disagreement across model families.",
      "Mechanical fetch-and-quote validation proves evidence before a TRUE verdict is accepted.",
      "Dark flags keep verification disabled and fact-check writes disabled until the evaluation gate passes.",
    ],
    deterministicVsLlm: "mixed",
    models: ["web-enabled investigator", "no-tool judge", "tie-break model"],
    inputs: ["event metadata", "web pages", "verify_settings flags"],
    outputs: ["candidate fact-check verdicts", "quote proofs", "verify run telemetry"],
    automation: "on_demand_script",
    safeguards: ["verify-write-gate", "verify-spend-caps", "ssrf-fetch-limits"],
    kpis: ["verify_spend_usd", "verify_runs_last_24h", "verify_halted", "verdict_mix"],
    status: "in_progress",
    ownerTask: "EDQ-BUILD-VERIFYENGINE-1126-902",
    lastUpdated: D,
    note: "The verify engine files are owned by the parallel 902 task and are not on main in this worktree. Target posture is dark: verify_settings verify_enabled=false and verify_write_fact_checks=false.",
    doneWhen: "",
    codePaths: ["scripts/verify/", "src/core/eventReliability.ts"],
  },
  {
    id: "evaluation-harness",
    stage: "verify",
    track: "shared",
    title: "Evaluation harness",
    summary:
      "The evaluation harness measures the verify engine before it may write. It uses a seeded-error set containing clean events, wrong-year events, wrong-place events, and fabricated events, all behind opaque references. Wilson 95% intervals keep small samples honest; the cleared-as-TRUE rate is the dangerous number because it measures false clears.",
    how: [
      "Build a seeded-error evaluation set with known ground truth.",
      "Run the verifier against opaque refs so model memory cannot identify rows directly.",
      "Compute Wilson 95% confidence intervals for verifier outcomes.",
      "Gate G2 depends on the measured false-clear behavior.",
    ],
    deterministicVsLlm: "mixed",
    models: [],
    inputs: ["seeded-error event set", "verify-engine outputs", "opaque references"],
    outputs: ["cleared-as-TRUE rate", "wrong detection rates", "Wilson intervals", "gate G2 evidence"],
    automation: "on_demand_script",
    safeguards: ["verify-write-gate"],
    kpis: ["verify_halted"],
    status: "in_progress",
    ownerTask: "EDQ-BUILD-EVALHARNESS-1126-903",
    lastUpdated: D,
    note: "The harness files are owned by the parallel 903 task and are not on main in this worktree.",
    doneWhen: "",
    codePaths: ["scripts/eval/"],
  },
  {
    id: "wikidata-matcher",
    stage: "verify",
    track: "legacy",
    title: "Wikidata matcher",
    summary:
      "The legacy Wikidata matcher is a mechanical audit that compares stored year and coordinates with candidate Wikidata items. Version 1 uses wbsearchentities label-prefix search and stored title variants; it does not use stored year or coordinates to choose the candidate, then checks those fields after selection. In prod, 1,816 of 1,902 no_match rows are no_search_hits, so no_match usually means the search failed, not that the event does not exist.",
    how: [
      "Build up to four title query variants from the AI narrative title.",
      "Search Wikidata labels, filter event-like items, and select by label/alias similarity plus sitelinks tie-break.",
      "Compare the selected item mechanically against stored year and coordinates.",
      "Store audit output in event_wikidata_verification without overwriting events or locations.",
    ],
    deterministicVsLlm: "deterministic",
    models: [],
    inputs: ["events", "locations", "Wikidata Action API", "Wikipedia full-text search for the planned v2"],
    outputs: ["event_wikidata_verification rows", "match status and mismatch diagnostics"],
    automation: "on_demand_script",
    safeguards: ["signed-years"],
    kpis: [],
    status: "live",
    ownerTask: null,
    lastUpdated: D,
    note: "v2 is planned: Wikipedia full-text search leads to the linked Wikidata item, followed by mechanical year/coordinate comparison. Prod counts at 2026-11-26: no_match 1,902 of which no_search_hits 1,816, no_event_like 85, below_score 1.",
    doneWhen: "event_wikidata_verification is populated by the service-role runner while events and locations remain unchanged by the audit.",
    codePaths: ["scripts/event-quality/wikidata-verify.ts", "src/core/wikidataMatch.ts"],
  },
  {
    id: "correction-loop",
    stage: "verify",
    track: "legacy",
    title: "Correction loop",
    summary:
      "The correction loop applies structured corrections for events whose verdict is wrong but whose corrected metadata is independently verified. It is not the same as quarantine: quarantine only sets retired_at, while correction updates content. The CLI, pure decision module, and event_correction schema are now on main, but content application remains gated by blind corr-v1 verification and image/manual review rules.",
    how: [
      "Consume corrected structured fields stored with fact-check rows and enqueue actionable correction candidates.",
      "Verify each proposed correction blindly through corr-v1 with at least two sources and two independent source families.",
      "Re-check the database state before apply; large year shifts and stale text or hints skip apply for review.",
      "Keep quarantine separate from correction so retirement remains reversible and narrow.",
    ],
    deterministicVsLlm: "deterministic",
    models: [],
    inputs: ["event_fact_checks.corrected", "event_correction_candidates", "blind corr-v1 verification results"],
    outputs: ["event_correction_log rows", "corrected event metadata when apply gates pass"],
    automation: "manual_devin",
    safeguards: ["quarantine-retired-at", "verify-write-gate"],
    kpis: ["needs_recheck"],
    status: "built_dark",
    ownerTask: "EDQ-BUILD-CORRECTIONLOOP-1126-898",
    lastUpdated: "2026-11-27",
    note: "Merged on current main after the registry seed: corrections-cli.ts, eventCorrections.ts, and migration 20261126100000_event_corrections.sql. The 898 progress row records the schema applied in prod, 72 enqueued candidates, and one quarantine write; correction application remains write-gated rather than generally live.",
    doneWhen: "Blindly verified corrections are applied through corrections-cli apply with event_correction_log rows and no direct event edits.",
    codePaths: ["scripts/factcheck/corrections-cli.ts", "src/core/eventCorrections.ts", "supabase/migrations/20261126100000_event_corrections.sql"],
  },
  {
    id: "vision-hint-reviews",
    stage: "verify",
    track: "shared",
    title: "Vision hint reviews",
    summary:
      "The AI player fleet writes ai_hint_reviews rows when reviewing hints against event text and images. These reviews are useful signal, but there is no independent ground truth for the reviewer verdicts. They therefore inform prioritization rather than proving correctness.",
    how: [
      "Fleet players inspect hint text in the context of an event.",
      "Rows record verdict, confidence, explanation, and suggested correction.",
      "Operators use the rows as review signal only, never as ground truth.",
    ],
    deterministicVsLlm: "llm",
    models: [],
    inputs: ["hints", "event text", "AI player fleet"],
    outputs: ["ai_hint_reviews rows"],
    automation: "on_demand_script",
    safeguards: ["ai-honesty-copy"],
    kpis: [],
    status: "live",
    ownerTask: null,
    lastUpdated: D,
    note: "Prod measurement at 2026-11-26: 7,171 rows over 343 events; informative only because reviewer correctness is itself unverified.",
    doneWhen: "ai_hint_reviews rows are written by the fleet and remain clearly separated from verified fact-check evidence.",
    codePaths: ["src/core/aiHintReview.ts", "supabase/migrations/20261103120000_ai_fleet_final.sql"],
  },
  {
    id: "image-generation",
    stage: "images",
    track: "generation",
    title: "Image generation",
    summary:
      "The proposed generator uses Runware FLUX.1 Kontext [pro] (AIR id bfl:3@1), estimated at about $0.04 per image. PR #487 is open at head 2b64d621 and adds the Runware adapter, admin generator UI, storage path, CLI, and image_generation_log migration. The PR code generates at the model registry default size of 1024x1024; the seed claim that only 1392x752 is accepted was not confirmed in the PR implementation.",
    how: [
      "Build prompt and negative prompt from locked event metadata.",
      "Call Runware imageInference with includeCost enabled.",
      "Download the provider URL and re-host the image in Supabase Storage before persisting it.",
      "Log pending, completed, failed, rejected, and accepted attempts in image_generation_log once that schema is applied.",
    ],
    deterministicVsLlm: "llm",
    models: ["Runware FLUX.1 Kontext [pro] (bfl:3@1)"],
    inputs: ["locked facts", "image prompt", "negative prompt", "Runware API"],
    outputs: ["generated image", "image_generation_log rows", "images rows after acceptance"],
    automation: "in_app_runtime",
    safeguards: ["verify-spend-caps", "service-role-unauth-check"],
    kpis: ["images_total"],
    status: "blocked",
    ownerTask: "EDQ-BUILD-ADMINGEN-1122-815",
    lastUpdated: D,
    note: "Blocked until PR #487 is merged and its migration is applied. Live GitHub check at 2026-11-26: state=open, merged=false, head_sha=2b64d6214dddb64cbae3e8a32ad182a1d0962574; image_generation_log is absent in prod.",
    doneWhen: "",
    codePaths: ["src/core/imageGen/", "scripts/images/gen-event-image.ts", "src/app/api/admin/generator/generate/"],
  },
  {
    id: "image-chrono-audit",
    stage: "images",
    track: "shared",
    title: "Image chrono audit",
    summary:
      "The chrono audit uses vision models to detect anachronistic objects, clothing, architecture, vehicles, technology, lighting, writing, and other scene content. The audit code is on main, but prod verification at 2026-11-26 shows ai_image_chrono_flags, ai_image_chrono_holds, and image_generation_log are absent. The step is therefore blocked on schema application and an operational run.",
    how: [
      "Select every image row for validated, non-retired events.",
      "Ask roster vision models to return strict JSON findings.",
      "Write one row per event/image/player/anachronism key; clean audits use flagged=false with an empty key.",
      "A hold requires at least two distinct players flagging the same element category on the current primary image.",
    ],
    deterministicVsLlm: "llm",
    models: [],
    inputs: ["images", "event year/place text", "vision roster"],
    outputs: ["ai_image_chrono_flags rows", "ai_image_chrono_holds view rows"],
    automation: "on_demand_script",
    safeguards: ["verify-spend-caps", "ai-honesty-copy"],
    kpis: ["chrono_flags"],
    status: "blocked",
    ownerTask: "EDQ-BUILD-IMGCHRONO-1122-810",
    lastUpdated: D,
    note: "Code exists on main, but to_regclass checks in prod return NULL for ai_image_chrono_flags and ai_image_chrono_holds; the migration file exists locally yet is not applied in prod.",
    doneWhen: "",
    codePaths: ["scripts/ai-players/image-chrono-audit.ts", "src/core/imageChrono.ts", "supabase/migrations/20261122120000_ai_image_chrono_flags.sql"],
  },
  {
    id: "ready-gate",
    stage: "publish",
    track: "shared",
    title: "Ready gate",
    summary:
      "The ready gate is the shared publication rule intended for both tracks. A generation-track event may go live only when reliability is at least RELIABILITY_PLAY_MIN, facts are locked, exactly 10 hints exist, and the image has passed the chrono audit. The legacy pool is currently gated in practice by reliability and retirement state, not by the full generation-ready rule.",
    how: [
      "Require reliability >= 95.",
      "Require locked facts from the generation track.",
      "Require exactly 10 hint rows.",
      "Require image generation and chrono audit clearance before publication.",
    ],
    deterministicVsLlm: "deterministic",
    models: [],
    inputs: ["event_reliability", "locked facts", "hints", "image audit state"],
    outputs: ["publishable generation events", "legacy play eligibility"],
    automation: "in_app_runtime",
    safeguards: ["reliability-rule", "fact-lock-gates"],
    kpis: ["pool_95", "hints_complete", "chrono_flags"],
    status: "planned",
    ownerTask: null,
    lastUpdated: D,
    note: "Planned for the generation track; no full generation ready-gate implementation exists on main.",
    doneWhen: "",
    codePaths: ["src/core/eventReliability.ts", "src/core/factLock.ts"],
  },
  {
    id: "translation",
    stage: "publish",
    track: "shared",
    title: "Translation",
    summary:
      "event_translations, hint_translations, and location_translations exist and already carry some legacy catalog translations. Translating newly generated events through the existing flow is planned rather than implemented. Coverage is measured per language against events in play; at the 2026-11-26 measurement, event translation coverage was 71 German and 1,159 French events out of 2,108 in play.",
    how: [
      "Keep English base rows authoritative.",
      "Store translations in child tables keyed by event/hint/location and language_code.",
      "Coalesce missing translations back to the base English content at read time.",
    ],
    deterministicVsLlm: "llm",
    models: [],
    inputs: ["events", "hints", "locations", "translation flow"],
    outputs: ["event_translations", "hint_translations", "location_translations"],
    automation: "on_demand_script",
    safeguards: [],
    kpis: ["translation_coverage"],
    status: "planned",
    ownerTask: null,
    lastUpdated: D,
    note: "Tables and legacy translations exist; new-generation translation is not built.",
    doneWhen: "",
    codePaths: ["supabase/migrations/024_add_translation_tables.sql", "supabase/migrations/20261112100000_translation_source_hash.sql"],
  },
  {
    id: "in-play",
    stage: "publish",
    track: "shared",
    title: "In play",
    summary:
      "In play means an event can be drawn for new gameplay. For the legacy catalog this currently means the row exists and retired_at is null; content status and game-mode queries can add further constraints. The generation track has no published rows yet.",
    how: [
      "Exclude retired_at rows from new draws.",
      "Use reliability and content readiness gates before generation-track publication.",
      "Keep past and in-flight games readable even when an event is later retired.",
    ],
    deterministicVsLlm: "deterministic",
    models: [],
    inputs: ["events", "event_reliability", "ready-gate result"],
    outputs: ["playable event pool"],
    automation: "in_app_runtime",
    safeguards: ["quarantine-retired-at", "broadcast-golden-path"],
    kpis: ["events_in_play", "pool_95"],
    status: "live",
    ownerTask: null,
    lastUpdated: D,
    note: "2,108 events were in play at the 2026-11-26 measurement.",
    doneWhen: "Events with retired_at null remain drawable and retired rows remain excluded from new draws.",
    codePaths: ["supabase/migrations/20261102120000_events_retired_at.sql"],
  },
];

export const PIPELINE_KPIS: readonly Kpi[] = [
  {
    id: "events_in_play",
    label: "Events in play",
    definition: "Events whose retired_at tombstone is null.",
    formula: "count(events) where retired_at IS NULL",
    denominator: "all rows in public.events",
    unit: "count",
    target: NOT_SET,
    source: "public.events",
    liveKey: "events_in_play",
  },
  {
    id: "events_checked",
    label: "Events checked",
    definition: "Distinct events with at least one row in the fact-check ledger; the coverage percentage uses only checked events that are still in play.",
    formula: "count(distinct event_fact_checks.event_id); coverage = in-play checked events / events_in_play",
    denominator: "events_in_play for coverage only",
    unit: "count",
    target: NOT_SET,
    source: "public.event_fact_checks + public.events",
    liveKey: "events_checked",
  },
  {
    id: "verdict_mix",
    label: "Verdict mix",
    definition: "Latest verdict per checked event from event_reliability. Verdict percentages use checked events only; unchecked is shown separately against events in play.",
    formula: "latest verdict count / count(event_reliability) for checked buckets; unchecked = events_in_play - in-play checked events",
    denominator: "checked events for verdict percentages; events_in_play only for the separate unchecked bucket",
    unit: "percent",
    target: "TRUE needs >= 2 proven sources from >= 2 source families, >= 1 year proof, >= 1 place proof",
    source: "public.event_reliability + public.events",
    liveKey: "verdict_mix",
  },
  {
    id: "pool_95",
    label: "Pool at reliability 95+",
    definition: "In-play events whose latest reliability is at least the play threshold.",
    formula: "count(events in play with event_reliability.reliability >= 95) / events_in_play",
    denominator: "events_in_play",
    unit: "percent",
    target: "RELIABILITY_PLAY_MIN = 95",
    source: "public.event_reliability + public.events",
    liveKey: "pool_95",
  },
  {
    id: "needs_recheck",
    label: "Needs recheck",
    definition: "In-play events whose latest fact-check row has needs_recheck true.",
    formula: "count(events in play where event_reliability.needs_recheck)",
    denominator: "events_in_play",
    unit: "count",
    target: NOT_SET,
    source: "public.event_reliability + public.events",
    liveKey: "needs_recheck",
  },
  {
    id: "review_queue_state",
    label: "Review queue state",
    definition: "Review queue rows split into pending, actively claimed, and done.",
    formula: "pending = open and no live lease; claimed = open with live lease; done = done_at present",
    denominator: "all rows in public.event_review_queue",
    unit: "count",
    target: NOT_SET,
    source: "public.event_review_queue",
    liveKey: "review_queue_state",
  },
  {
    id: "candidates_by_status",
    label: "Candidates by status",
    definition: "Generation candidates grouped by the staged status new, narrated, checked, published, or rejected.",
    formula: "count(generation_candidates) group by status",
    denominator: "all rows in public.generation_candidates",
    unit: "count",
    target: NOT_SET,
    source: "public.generation_candidates",
    liveKey: "candidates_by_status",
  },
  {
    id: "candidates_by_continent_and_era",
    label: "Candidates by continent and era",
    definition: "Generation candidates grouped by declared continent and the seven fact-lock era buckets.",
    formula: "count(generation_candidates) group by continent and eraForYear(event_year)",
    denominator: "all rows in public.generation_candidates",
    unit: "count",
    target: NOT_SET,
    source: "public.generation_candidates + src/core/factLock.ts eraForYear",
    liveKey: "candidates_by_continent_and_era",
  },
  {
    id: "hints_complete",
    label: "Events with 10 hints",
    definition: "In-play events with exactly 10 hint rows.",
    formula: "count(events in play having exactly 10 hints) / events_in_play",
    denominator: "events_in_play",
    unit: "percent",
    target: NOT_SET,
    source: "public.events + public.hints",
    liveKey: "hints_complete",
  },
  {
    id: "translation_coverage",
    label: "Translation coverage",
    definition: "Distinct in-play events with an event_translations row, grouped by language_code.",
    formula: "count(distinct translated in-play events per language) / events_in_play",
    denominator: "events_in_play for each language percentage",
    unit: "percent",
    target: NOT_SET,
    source: "public.event_translations + public.events",
    liveKey: "translation_coverage",
  },
  {
    id: "images_total",
    label: "Images total",
    definition: "Rows in the images table.",
    formula: "count(images)",
    denominator: "all rows in public.images",
    unit: "count",
    target: NOT_SET,
    source: "public.images",
    liveKey: "images_total",
  },
  {
    id: "chrono_flags",
    label: "Chrono flags",
    definition: "Rows and flagged rows in the image chrono-audit table once that table exists.",
    formula: "count(ai_image_chrono_flags), count(*) filter (flagged)",
    denominator: "all rows in public.ai_image_chrono_flags",
    unit: "count",
    target: NOT_SET,
    source: "public.ai_image_chrono_flags",
    liveKey: "chrono_flags",
  },
  {
    id: "verify_spend_usd",
    label: "Verify spend",
    definition: "Spend recorded by the automated verify engine once its telemetry schema exists.",
    formula: "sum(verify cost rows)",
    denominator: "all verify cost rows",
    unit: "usd",
    target: NOT_SET,
    source: "pending: EDQ-BUILD-VERIFYENGINE-1126-902",
    liveKey: "verify_spend_usd",
  },
  {
    id: "verify_runs_last_24h",
    label: "Verify runs last 24h",
    definition: "Automated verify runs started in the last 24 hours once the runs table exists.",
    formula: "count(verify_runs started in last 24 hours)",
    denominator: "all rows in the future verify runs table",
    unit: "count",
    target: NOT_SET,
    source: "pending: EDQ-BUILD-VERIFYENGINE-1126-902",
    liveKey: "verify_runs_last_24h",
  },
  {
    id: "verify_halted",
    label: "Verify halted",
    definition: "Whether the automated verifier halt latch is set once verify_settings exists.",
    formula: "verify_settings halt flag",
    denominator: "single verify_settings row",
    unit: "count",
    target: NOT_SET,
    source: "pending: EDQ-BUILD-VERIFYENGINE-1126-902",
    liveKey: "verify_halted",
  },
];

export const PIPELINE_SAFEGUARDS: readonly Safeguard[] = [
  {
    id: "verify-write-gate",
    title: "Verify write gate",
    protects: "event_fact_checks and production content from unproven automated verdicts",
    mechanism: "verify_enabled=false and verify_write_fact_checks=false keep the engine dark until gate G2 passes",
    enforcedBy: "db",
    status: "in_progress",
    ownerTask: "EDQ-BUILD-VERIFYENGINE-1126-902",
    lastUpdated: D,
    note: "",
  },
  {
    id: "verify-spend-caps",
    title: "Spend caps, deferral, breaker, halt latch",
    protects: "provider budget and operator control",
    mechanism: "spend caps, 429 deferral, circuit breaker, and a halt latch stop automated model work before cost or failure loops grow",
    enforcedBy: "code",
    status: "in_progress",
    ownerTask: "EDQ-BUILD-VERIFYENGINE-1126-902",
    lastUpdated: D,
    note: "",
  },
  {
    id: "ssrf-fetch-limits",
    title: "SSRF-safe fetch limits",
    protects: "the verifier backend from unsafe source fetches",
    mechanism: "https only; private, loopback, link-local, and metadata IP ranges blocked; at most 3 revalidated redirects; 10 second timeout; response limited to 1.5 MB",
    enforcedBy: "code",
    status: "in_progress",
    ownerTask: "EDQ-BUILD-VERIFYENGINE-1126-902",
    lastUpdated: D,
    note: "",
  },
  {
    id: "fact-lock-gates",
    title: "Fact-lock gates G1-G5",
    protects: "generation-track title, year, coordinates, and country",
    mechanism: "facts come from Wikidata, Wikipedia leads, and reverse geocoding through deterministic gates; an LLM never supplies locked facts",
    enforcedBy: "code",
    status: "live",
    ownerTask: null,
    lastUpdated: D,
    note: "",
  },
  {
    id: "signed-years",
    title: "Signed years, never legacy era strings",
    protects: "date ordering and pre-era arithmetic",
    mechanism: "Wikidata negative years map directly to signed event_year integers; serialized year zero is rejected rather than guessed",
    enforcedBy: "code",
    status: "live",
    ownerTask: null,
    lastUpdated: D,
    note: "",
  },
  {
    id: "ai-honesty-copy",
    title: "AI-honesty copy guard",
    protects: "users from overclaiming generated content accuracy",
    mechanism: "i18n guard tests require explicit copy that events and images are AI-generated and may contain errors",
    enforcedBy: "ci",
    status: "live",
    ownerTask: null,
    lastUpdated: D,
    note: "",
  },
  {
    id: "quarantine-retired-at",
    title: "Quarantine is retired_at only",
    protects: "audit history and in-flight games while removing bad events from new draws",
    mechanism: "wrong events are tombstoned with retired_at; rows are not deleted and status is not rewritten as a side effect",
    enforcedBy: "db",
    status: "live",
    ownerTask: null,
    lastUpdated: D,
    note: "",
  },
  {
    id: "secret-scan",
    title: "Secret scan and SECRET-SAFETY rules",
    protects: "credentials and provider keys",
    mechanism: "staged diffs are scanned for secret shapes; operational output passes through redactors and never prints env values",
    enforcedBy: "ci",
    status: "live",
    ownerTask: null,
    lastUpdated: D,
    note: "",
  },
  {
    id: "broadcast-golden-path",
    title: "Broadcast/golden-path gate",
    protects: "the compete core from regressions while pipeline work proceeds",
    mechanism: "protected compete files trigger the golden-path gate; the banned room-wide broadcast call remains absent from src and partykit outside the owned implementation path",
    enforcedBy: "ci",
    status: "live",
    ownerTask: null,
    lastUpdated: D,
    note: "",
  },
  {
    id: "service-role-unauth-check",
    title: "Service-role route unauthenticated check",
    protects: "admin/service-role data surfaces",
    mechanism: "production-mode routes are requested without cookies and must redirect or forbid rather than render page content",
    enforcedBy: "process",
    status: "live",
    ownerTask: null,
    lastUpdated: D,
    note: "",
  },
  {
    id: "reliability-rule",
    title: "Deterministic reliability rule",
    protects: "play eligibility from subjective confidence scores",
    mechanism: "computeReliability is the single scoring rule and RELIABILITY_PLAY_MIN is 95",
    enforcedBy: "code",
    status: "live",
    ownerTask: null,
    lastUpdated: D,
    note: "",
  },
];

export const PIPELINE_STEP_BY_ID: Readonly<Record<string, PipelineStep>> = Object.freeze(
  Object.fromEntries(PIPELINE_STEPS.map((step) => [step.id, step]))
);

export const PIPELINE_KPI_BY_ID: Readonly<Record<string, Kpi>> = Object.freeze(
  Object.fromEntries(PIPELINE_KPIS.map((kpi) => [kpi.id, kpi]))
);

export const PIPELINE_SAFEGUARD_BY_ID: Readonly<Record<string, Safeguard>> = Object.freeze(
  Object.fromEntries(PIPELINE_SAFEGUARDS.map((safeguard) => [safeguard.id, safeguard]))
);

export function registryLastUpdated(): string {
  return [...PIPELINE_STEPS, ...PIPELINE_SAFEGUARDS].reduce(
    (max, row) => (row.lastUpdated > max ? row.lastUpdated : max),
    "0000-00-00"
  );
}
